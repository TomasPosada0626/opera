import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';

type TransactionClient = Prisma.TransactionClient;
const orderInclude = { product: true, warehouse: true };
const sortableFields = ['createdAt', 'status'] as const;

interface Shortage {
  componentId: string;
  componentName: string;
  required: string;
  available: string;
}

@Injectable()
export class ProductionOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  findAll(query: ListQueryDto) {
    const { page = 1, pageSize = 20, sortBy, sortOrder = 'desc' } = query;
    const orderBy = resolveOrderBy(
      sortBy,
      sortOrder,
      sortableFields,
      'createdAt',
    );

    return paginate(
      () => this.prisma.productionOrder.count(),
      ({ skip, take }) =>
        this.prisma.productionOrder.findMany({
          include: orderInclude,
          orderBy,
          skip,
          take,
        }),
      page,
      pageSize,
    );
  }

  async findOne(id: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) {
      throw new NotFoundException('Orden de producción no encontrada');
    }

    return order;
  }

  // Valida disponibilidad de materiales al momento de crear la orden, pero no
  // reserva/bloquea stock — es informativo, no una garantía. La orden en sí
  // no mueve nada (StockMovement solo se crea al completarla, #33), así que
  // no hay nada que proteger con una transacción aquí: la validación real
  // contra sobregiro vive en el completar, con el mismo patrón Serializable
  // que ya usan salidas y ajustes (ver ADR 0001).
  async create(dto: CreateProductionOrderDto, actingUserId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    if (product.type !== 'FINISHED_GOOD') {
      throw new BadRequestException(
        'Solo se pueden crear órdenes de producción para productos terminados',
      );
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Bodega no encontrada');
    }

    const bom = await this.prisma.billOfMaterials.findUnique({
      where: { productId: dto.productId },
      include: { items: { include: { component: true } } },
    });
    if (!bom || !bom.isActive || bom.items.length === 0) {
      throw new BadRequestException(
        'Este producto no tiene una receta activa configurada',
      );
    }

    const shortages: Shortage[] = [];
    for (const item of bom.items) {
      const required = item.quantity.mul(dto.quantity);
      const available = await this.inventory.getStock(
        item.componentId,
        dto.warehouseId,
      );
      if (available.lessThan(required)) {
        shortages.push({
          componentId: item.componentId,
          componentName: item.component.name,
          required: required.toString(),
          available: available.toString(),
        });
      }
    }
    if (shortages.length > 0) {
      throw new BadRequestException({
        message: 'Stock insuficiente de materias primas para esta orden',
        shortages,
      });
    }

    const order = await this.prisma.productionOrder.create({
      data: {
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        quantity: dto.quantity,
        userId: actingUserId,
      },
      include: orderInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'ProductionOrder',
      entityId: order.id,
      action: 'CREATE',
      after: order,
    });

    return order;
  }

  // Usa la receta VIGENTE al completar, no una copia congelada de cuando se
  // creó la orden (BillOfMaterials no es versionada, ver #29) — si la receta
  // cambió o se desactivó entre crear y completar, esto lo revalida. Todo el
  // consumo (SALIDA por componente) + la entrada del terminado + el cambio
  // de estado ocurren en una sola transacción Serializable: mismo patrón que
  // protege salidas/ajustes contra sobregiro (ver ADR 0001 y #22/#23/#25),
  // ahora también para no completar dos veces la misma orden bajo carrera.
  async complete(id: string, actingUserId: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
    });
    if (!order) {
      throw new NotFoundException('Orden de producción no encontrada');
    }
    if (order.status !== 'PENDIENTE') {
      throw new BadRequestException(
        `La orden ya está en estado ${order.status}, no se puede completar de nuevo`,
      );
    }

    try {
      const completed = await this.prisma.$transaction(
        async (tx: TransactionClient) => {
          const bom = await tx.billOfMaterials.findUnique({
            where: { productId: order.productId },
            include: { items: { include: { component: true } } },
          });
          if (!bom || !bom.isActive || bom.items.length === 0) {
            throw new BadRequestException(
              'Este producto ya no tiene una receta activa configurada',
            );
          }

          const shortages: Shortage[] = [];
          const requirements: {
            componentId: string;
            required: Prisma.Decimal;
            unitCost: Prisma.Decimal;
          }[] = [];
          for (const item of bom.items) {
            const required = item.quantity.mul(order.quantity);
            const available = await this.inventory.getStock(
              item.componentId,
              order.warehouseId,
              tx,
            );
            if (available.lessThan(required)) {
              shortages.push({
                componentId: item.componentId,
                componentName: item.component.name,
                required: required.toString(),
                available: available.toString(),
              });
            }
            // Costo promedio ponderado vigente de este componente (ADR
            // 0002) — es lo que vale cada unidad consumida, no lo que costó
            // originalmente comprarla.
            const unitCost = await this.inventory.getAverageCost(
              item.componentId,
              order.warehouseId,
              tx,
            );
            requirements.push({
              componentId: item.componentId,
              required,
              unitCost,
            });
          }
          if (shortages.length > 0) {
            throw new BadRequestException({
              message:
                'Stock insuficiente de materias primas para completar esta orden',
              shortages,
            });
          }

          let totalCost = new Prisma.Decimal(0);
          for (const requirement of requirements) {
            totalCost = totalCost.plus(
              requirement.unitCost.times(requirement.required),
            );
            await tx.stockMovement.create({
              data: {
                productId: requirement.componentId,
                warehouseId: order.warehouseId,
                type: 'SALIDA',
                quantity: requirement.required.negated(),
                unitCost: requirement.unitCost,
                reason: `Consumo de orden de producción ${order.id}`,
                userId: actingUserId,
              },
            });
          }
          // Costo del producto terminado = costo total de lo consumido /
          // cantidad producida — el mismo promedio ponderado, ahora del lado
          // de la salida (ver ADR 0002).
          const finishedGoodUnitCost = totalCost.dividedBy(order.quantity);

          await tx.stockMovement.create({
            data: {
              productId: order.productId,
              warehouseId: order.warehouseId,
              type: 'ENTRADA',
              quantity: order.quantity,
              unitCost: finishedGoodUnitCost,
              reason: `Producción completada, orden ${order.id}`,
              userId: actingUserId,
            },
          });

          return tx.productionOrder.update({
            where: { id: order.id },
            data: {
              status: 'COMPLETADA',
              completedAt: new Date(),
              totalCost,
              unitCost: finishedGoodUnitCost,
            },
            include: orderInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      await this.audit.log({
        userId: actingUserId,
        entity: 'ProductionOrder',
        entityId: completed.id,
        action: 'COMPLETE',
        before: { status: order.status },
        after: { status: completed.status, completedAt: completed.completedAt },
      });

      return completed;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        // P2034: Postgres abortó la transacción por conflicto de
        // serialización. P2028: bajo contención fuerte (varios
        // completados de la misma orden a la vez, ver #91) algunos
        // perdedores ni siquiera llegan a competir por el commit —
        // Prisma agota el timeout esperando el lock para *empezar* la
        // transacción. Ambos son la misma historia de cara al cliente
        // ("perdiste la carrera, reintenta"), no un 500 real.
        (error.code === 'P2034' || error.code === 'P2028')
      ) {
        throw new ConflictException(
          'Conflicto al completar la orden, intenta de nuevo',
        );
      }
      throw error;
    }
  }
}
