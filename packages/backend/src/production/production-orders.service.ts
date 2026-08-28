import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(ProductionOrdersService.name);

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
    // isActive es un flag de catálogo (CatalogService.deactivate), no
    // borrado — sin este chequeo se podía seguir produciendo un producto
    // "desactivado" (señalado en la auditoría).
    if (!product.isActive) {
      throw new BadRequestException('El producto está desactivado');
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Bodega no encontrada');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException('La bodega está desactivada');
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

    // Un solo getStockForProducts agrupado para todos los componentes de la
    // receta, en vez de un getStock por componente dentro del for — mismo
    // batching que ya tiene complete() (señalado en la re-auditoría como
    // inconsistencia entre los dos métodos que recorren el mismo BOM).
    const componentIds = bom.items.map((item) => item.componentId);
    const stockByComponent = await this.inventory.getStockForProducts(
      componentIds,
      dto.warehouseId,
    );
    const stockById = new Map(
      stockByComponent.map(({ productId, stock }) => [productId, stock]),
    );

    const shortages: Shortage[] = [];
    for (const item of bom.items) {
      const required = item.quantity.mul(dto.quantity);
      const available =
        stockById.get(item.componentId) ?? new Prisma.Decimal(0);
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
      this.logger.warn(
        `Orden de producción rechazada por stock insuficiente: producto ${dto.productId}, ${shortages.length} componente(s) en falta`,
      );
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
  // de estado ocurren en una sola transacción Serializable, mismo patrón que
  // protege salidas/ajustes contra sobregiro (ver ADR 0001 y #22/#23/#25).
  // El e2e de concurrencia real (#91) probó que Serializable solo no basta
  // para no completar dos veces la misma orden: un `update` incondicional
  // deja pasar más de una llamada cuando las transacciones no llegan a
  // solaparse de verdad en Postgres (p.ej. bajo contención del pool de
  // conexiones en CI), porque nunca releen el estado dentro de la
  // transacción. El `updateMany` con `status: 'PENDIENTE'` en el where es
  // el guard atómico real — Serializable queda como red adicional para
  // conflictos genuinos de lectura concurrente (getStock, getAverageCost).
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

          // Un solo par de consultas agrupadas para TODOS los componentes de
          // la receta, en vez de leer stock/costo componente por componente
          // dentro del for — con recetas de muchos ingredientes, el loop
          // secuencial alargaba la ventana de la transacción Serializable
          // justo cuando más importa que sea corta (más tiempo con locks
          // abiertos = más contención real entre completados concurrentes,
          // señalado en la auditoría de escalabilidad).
          const componentIds = bom.items.map((item) => item.componentId);
          const [stockByComponent, costByComponent] = await Promise.all([
            this.inventory.getStockForProducts(
              componentIds,
              order.warehouseId,
              tx,
            ),
            this.inventory.getAverageCostForProducts(
              componentIds,
              order.warehouseId,
              tx,
            ),
          ]);
          const stockById = new Map(
            stockByComponent.map(({ productId, stock }) => [productId, stock]),
          );

          const shortages: Shortage[] = [];
          const requirements: {
            componentId: string;
            required: Prisma.Decimal;
            unitCost: Prisma.Decimal;
          }[] = [];
          for (const item of bom.items) {
            const required = item.quantity.mul(order.quantity);
            const available =
              stockById.get(item.componentId) ?? new Prisma.Decimal(0);
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
            const unitCost =
              costByComponent.get(item.componentId) ?? new Prisma.Decimal(0);
            requirements.push({
              componentId: item.componentId,
              required,
              unitCost,
            });
          }
          if (shortages.length > 0) {
            this.logger.warn(
              `Completado de la orden ${order.id} rechazado por stock insuficiente: ${shortages.length} componente(s) en falta`,
            );
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
          }
          // Un solo createMany para todas las SALIDA de componentes en vez
          // de un create por componente dentro del for — menos tiempo con
          // locks abiertos dentro de la transacción Serializable, mismo
          // motivo que el batching de lecturas de más arriba (señalado en
          // la re-auditoría de escalabilidad).
          await tx.stockMovement.createMany({
            data: requirements.map((requirement) => ({
              productId: requirement.componentId,
              warehouseId: order.warehouseId,
              type: 'SALIDA' as const,
              quantity: requirement.required.negated(),
              unitCost: requirement.unitCost,
              reason: `Consumo de orden de producción ${order.id}`,
              userId: actingUserId,
            })),
          });
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

          const result = await tx.productionOrder.updateMany({
            where: { id: order.id, status: 'PENDIENTE' },
            data: {
              status: 'COMPLETADA',
              completedAt: new Date(),
              totalCost,
              unitCost: finishedGoodUnitCost,
            },
          });
          if (result.count === 0) {
            throw new ConflictException(
              'La orden cambió de estado antes de poder completarla, intenta de nuevo',
            );
          }

          return tx.productionOrder.findUniqueOrThrow({
            where: { id: order.id },
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
        this.logger.warn(
          `Conflicto de concurrencia completando la orden ${id} (${error.code}) — el cliente reintentará`,
        );
        throw new ConflictException(
          'Conflicto al completar la orden, intenta de nuevo',
        );
      }
      throw error;
    }
  }

  // #98: crear la orden nunca escribió StockMovement (solo lo valida como
  // informativo, ver create()) — cancelar no tiene nada que revertir, solo
  // un campo de estado, y únicamente mientras siga PENDIENTE (una orden
  // COMPLETADA ya consumió materiales reales, y esos StockMovement no se
  // deshacen — mismo espíritu que OrdersService.cancel con el Kardex
  // append-only). `updateMany` con el guard de estado en el `where` hace la
  // transición atómica sin necesitar Serializable, mismo patrón que
  // OrdersService.markProduction/cancel.
  async cancel(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.status !== 'PENDIENTE') {
      throw new BadRequestException(
        `La orden está en estado ${before.status}, no se puede cancelar`,
      );
    }

    const result = await this.prisma.productionOrder.updateMany({
      where: { id, status: 'PENDIENTE' },
      data: { status: 'CANCELADA' },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'La orden cambió de estado antes de poder cancelarla, intenta de nuevo',
      );
    }

    const order = await this.findOne(id);
    await this.audit.log({
      userId: actingUserId,
      entity: 'ProductionOrder',
      entityId: order.id,
      action: 'CANCEL',
      before: { status: before.status },
      after: { status: order.status },
    });

    return order;
  }
}
