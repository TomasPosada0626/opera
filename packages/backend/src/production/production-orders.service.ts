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
import { CompleteProductionOrderDto } from './dto/complete-production-order.dto';
import {
  completeProductionOrderInTx,
  type MaterialShortage,
  warehouseOrderWhenProductionDone,
} from './production-completion';

type TransactionClient = Prisma.TransactionClient;
// order: el pedido del que sale la orden (ADR 0012), para mostrarlo en la
// pestaña Producción.
const orderInclude = {
  product: { include: { unit: true } },
  warehouse: true,
  order: {
    select: { id: true, number: true, customer: { select: { name: true } } },
  },
};
const sortableFields = ['createdAt', 'status'] as const;

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
        // Las órdenes de un mismo pedido nacen en la misma transacción (igual
        // createdAt): el número del pedido y luego el id las dejan en un
        // orden estable entre páginas.
        this.prisma.productionOrder.findMany({
          include: orderInclude,
          orderBy: [orderBy, { order: { number: 'desc' } }, { id: 'asc' }],
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

  // Orden para stock (sin pedido detrás). La lista de materiales es
  // opcional (ADR 0012): Herrajes Toro no registra materias primas. Si el
  // producto sí tiene lista, se avisa de una vez si falta material, aunque
  // no se reserva nada: la validación real vive en el completar.
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
    if (bom && bom.isActive && bom.items.length > 0) {
      const componentIds = bom.items.map((item) => item.componentId);
      const stockByComponent = await this.inventory.getStockForProducts(
        componentIds,
        dto.warehouseId,
      );
      const stockById = new Map(
        stockByComponent.map(({ productId, stock }) => [productId, stock]),
      );

      const shortages: MaterialShortage[] = [];
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

  // Entra al inventario lo que salió bueno (ADR 0012, ver
  // completeProductionOrderInTx). Si la orden es de un pedido y era la
  // última pendiente, el pedido pasa a almacén en la misma transacción.
  // Serializable + P2034/P2028 como el resto de transacciones del proyecto
  // (ADR 0001, #91).
  async complete(
    id: string,
    dto: CompleteProductionOrderDto,
    actingUserId: string,
  ) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: { order: { select: { number: true } } },
    });
    if (!order) {
      throw new NotFoundException('Orden de producción no encontrada');
    }
    if (order.status !== 'PENDIENTE') {
      throw new BadRequestException(
        `La orden ya está en estado ${order.status}, no se puede completar de nuevo`,
      );
    }
    const producedQuantity =
      dto.producedQuantity !== undefined
        ? new Prisma.Decimal(dto.producedQuantity)
        : order.quantity;

    try {
      const { completed, warehoused } = await this.prisma.$transaction(
        async (tx: TransactionClient) => {
          await completeProductionOrderInTx(
            tx,
            this.inventory,
            order,
            producedQuantity,
            order.orderId && order.order
              ? `Producción terminada, pedido No. ${order.order.number}`
              : `Producción completada, orden ${order.id}`,
            actingUserId,
          );
          const warehoused = order.orderId
            ? await warehouseOrderWhenProductionDone(tx, order.orderId)
            : false;
          const completed = await tx.productionOrder.findUniqueOrThrow({
            where: { id: order.id },
            include: orderInclude,
          });
          return { completed, warehoused };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      await this.audit.log({
        userId: actingUserId,
        entity: 'ProductionOrder',
        entityId: completed.id,
        action: 'COMPLETE',
        before: { status: order.status },
        after: {
          status: completed.status,
          completedAt: completed.completedAt,
          producedQuantity: completed.producedQuantity,
        },
      });
      if (warehoused && order.orderId) {
        await this.audit.log({
          userId: actingUserId,
          entity: 'Order',
          entityId: order.orderId,
          action: 'MARK_WAREHOUSED',
          before: { status: 'EN_PRODUCCION' },
          after: { status: 'EN_ALMACEN' },
        });
      }

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
    // Una orden de un pedido se deja de producir cancelando el pedido (que
    // cancela sus órdenes pendientes): cancelarla sola dejaría el pedido en
    // producción para siempre, sin nada que lo pase a almacén.
    if (before.order) {
      throw new BadRequestException(
        `Esta orden es del pedido No. ${before.order.number}: para no producirla, cancela el pedido.`,
      );
    }
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
