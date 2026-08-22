import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateOrderDto } from './dto/create-order.dto';

type TransactionClient = Prisma.TransactionClient;
const orderInclude = {
  customer: true,
  warehouse: true,
  items: { include: { product: true } },
  // La vista de detalle (#54) necesita mostrar cuánto se ha entregado por
  // línea sin una segunda llamada a /remissions?orderId=... — se deriva en
  // el cliente de estos items, mismo espíritu que el resto de "no guardar
  // lo que se puede derivar". user en el mismo shape que remissionInclude
  // de RemissionsService — el frontend renderiza remission.user.name igual
  // en ambos casos (encontrado probando en vivo: sin esto, crear una
  // remisión y ver el detalle actualizado tronaba con "Cannot read
  // properties of undefined (reading 'name')").
  remissions: {
    include: {
      user: { select: { id: true, name: true } },
      items: true,
    },
  },
};
const sortableFields = ['createdAt', 'status'] as const;

interface Shortage {
  productId: string;
  productName: string;
  required: string;
  available: string;
}

@Injectable()
export class OrdersService {
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
      () => this.prisma.order.count(),
      ({ skip, take }) =>
        this.prisma.order.findMany({
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
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }

    return order;
  }

  // Un pedido de venta compromete inventario de inmediato (a diferencia de
  // una orden de producción, que no mueve nada hasta completarse) — validar
  // disponibilidad y generar el StockMovement SALIDA de cada línea pasa
  // dentro de la misma transacción Serializable que crea el pedido, mismo
  // patrón que ProductionOrdersService.complete() (ver ADR 0001): sin esto,
  // dos pedidos concurrentes por el mismo producto podrían leer el mismo
  // stock disponible y sobregirarlo.
  async create(dto: CreateOrderDto, actingUserId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Bodega no encontrada');
    }

    const productIds = dto.items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    for (const item of dto.items) {
      if (!productById.has(item.productId)) {
        throw new NotFoundException(`Producto ${item.productId} no encontrado`);
      }
    }

    try {
      const order = await this.prisma.$transaction(
        async (tx: TransactionClient) => {
          const shortages: Shortage[] = [];
          for (const item of dto.items) {
            const available = await this.inventory.getStock(
              item.productId,
              dto.warehouseId,
              tx,
            );
            if (available.lessThan(item.quantity)) {
              shortages.push({
                productId: item.productId,
                productName: productById.get(item.productId)!.name,
                required: String(item.quantity),
                available: available.toString(),
              });
            }
          }
          if (shortages.length > 0) {
            throw new BadRequestException({
              message: 'Stock insuficiente para completar este pedido',
              shortages,
            });
          }

          const created = await tx.order.create({
            data: {
              customerId: dto.customerId,
              warehouseId: dto.warehouseId,
              userId: actingUserId,
              items: {
                create: dto.items.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                })),
              },
            },
            include: orderInclude,
          });

          for (const item of dto.items) {
            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                warehouseId: dto.warehouseId,
                type: 'SALIDA',
                quantity: new Prisma.Decimal(item.quantity).negated(),
                reason: `Venta, pedido ${created.id}`,
                userId: actingUserId,
              },
            });
          }

          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      await this.audit.log({
        userId: actingUserId,
        entity: 'Order',
        entityId: order.id,
        action: 'CREATE',
        after: order,
      });

      return order;
    } catch (error) {
      // P2034: conflicto de serialización al comitear. P2028: bajo
      // contención fuerte, Prisma agota el timeout esperando el lock antes
      // de siquiera llegar al conflicto (ver #91) — ambos son la misma
      // historia de cara al cliente, nunca un 500 sin manejar.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2028')
      ) {
        throw new ConflictException(
          'Conflicto al crear el pedido, intenta de nuevo',
        );
      }
      throw error;
    }
  }
}
