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
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import {
  completeProductionOrderInTx,
  warehouseOrderWhenProductionDone,
} from '../production/production-completion';

type TransactionClient = Prisma.TransactionClient;

// Medianoche UTC del día de HOY en la hora local del servidor — así se
// compara contra estimatedDeliveryDate (DATE, guardado como medianoche
// UTC de ese día) sin que la zona horaria corra el día.
export function todayAsDateOnly(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

// Atrasado = la fecha de envío prometida ya pasó (estrictamente antes de
// hoy) y el pedido sigue sin despachar ni cancelar. Compartido con el
// dashboard para que "atrasado" signifique lo mismo en las dos pantallas.
export function overdueWhere(now: Date = new Date()): Prisma.OrderWhereInput {
  return {
    estimatedDeliveryDate: { lt: todayAsDateOnly(now) },
    status: { in: ['PENDIENTE', 'EN_PRODUCCION', 'EN_ALMACEN'] },
  };
}
const orderInclude = {
  customer: true,
  warehouse: true,
  items: { include: { product: true } },
  // Cuánto va de la producción del pedido (ADR 0012).
  productionOrders: {
    select: {
      id: true,
      orderItemId: true,
      status: true,
      quantity: true,
      producedQuantity: true,
    },
  },
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
      payments: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { paidAt: 'asc' as const },
      },
    },
    orderBy: { number: 'asc' as const },
  },
};
const sortableFields = [
  'createdAt',
  'status',
  'number',
  'estimatedDeliveryDate',
] as const;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  // `search` busca por número de pedido (entero exacto) o por nombre del
  // cliente (contiene, sin distinguir mayúsculas). Por defecto la lista sale
  // del pedido más reciente al más viejo; el número desempata los creados en
  // el mismo instante.
  findAll(query: ListOrdersDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'desc',
      status,
      customerId,
      overdue,
      search,
    } = query;
    const orderBy = resolveOrderBy(
      sortBy,
      sortOrder,
      sortableFields,
      'createdAt',
    );
    const term = search?.trim();
    const parsedNumber = term ? Number(term) : undefined;
    // overdue va dentro de AND porque también restringe `status` — así se
    // combina con ?status= en vez de pisarlo.
    const where: Prisma.OrderWhereInput = {
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
      ...(term
        ? {
            OR: [
              ...(Number.isInteger(parsedNumber)
                ? [{ number: parsedNumber }]
                : []),
              { customer: { name: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(overdue ? { AND: [overdueWhere()] } : {}),
    };

    return paginate(
      () => this.prisma.order.count({ where }),
      ({ skip, take }) =>
        this.prisma.order.findMany({
          where,
          include: orderInclude,
          orderBy: [orderBy, { number: 'desc' }],
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

  // Este negocio fabrica sobre pedido — no hay stock de terminado esperando
  // venta, así que crear el pedido no mueve inventario (ver comentario de
  // Order en schema.prisma). Solo valida que cliente/bodega/productos
  // existan; no hay nada que proteger con una transacción Serializable
  // aquí porque no hay una decisión de stock que dos pedidos concurrentes
  // puedan pisarse — esa protección ahora vive en markWarehoused() y en
  // RemissionsService.create(), que sí mueven stock.
  async create(dto: CreateOrderDto, actingUserId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }
    // isActive es un flag de catálogo (CatalogService.deactivate), no borrado
    // — sin este chequeo seguía pudiendo recibir pedidos nuevos después de
    // "desactivado", el flag era cosmético fuera de su propio listado
    // (señalado en la auditoría).
    if (!customer.isActive) {
      throw new BadRequestException('El cliente está desactivado');
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

    const productIds = dto.items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    for (const item of dto.items) {
      const product = productById.get(item.productId);
      if (!product) {
        throw new NotFoundException(`Producto ${item.productId} no encontrado`);
      }
      if (!product.isActive) {
        throw new BadRequestException(
          `El producto ${product.name} está desactivado`,
        );
      }
    }

    const order = await this.prisma.order.create({
      data: {
        customerId: dto.customerId,
        warehouseId: dto.warehouseId,
        userId: actingUserId,
        estimatedDeliveryDate: dto.estimatedDeliveryDate
          ? new Date(dto.estimatedDeliveryDate)
          : undefined,
        notes: dto.notes?.trim() || undefined,
        vatRate: dto.vatRate ?? 0,
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

    await this.audit.log({
      userId: actingUserId,
      entity: 'Order',
      entityId: order.id,
      action: 'CREATE',
      after: order,
    });

    return order;
  }

  // Solo la fecha de envío estimada y las notas — los datos de seguimiento
  // que la dueña ajusta mientras el pedido avanza (el cliente pidió
  // adelantar, se atrasó un material). Un pedido cancelado ya no se edita.
  async update(id: string, dto: UpdateOrderDto, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.status === 'CANCELADO') {
      throw new BadRequestException('No se puede editar un pedido cancelado');
    }
    // Cada remisión guardó el IVA con el que se emitió (y el cliente ya
    // puede haber abonado contra ese total): cambiar la tarifa después
    // dejaría el pedido diciendo una cosa y sus remisiones otra.
    if (
      dto.vatRate !== undefined &&
      !before.vatRate.equals(dto.vatRate) &&
      before.remissions.some((remission) => remission.voidedAt === null)
    ) {
      throw new BadRequestException(
        'El IVA no se puede cambiar porque el pedido ya tiene remisiones. Anúlalas primero si el IVA quedó mal.',
      );
    }

    const order = await this.prisma.order.update({
      where: { id },
      data: {
        ...(dto.vatRate !== undefined ? { vatRate: dto.vatRate } : {}),
        ...(dto.estimatedDeliveryDate !== undefined
          ? {
              estimatedDeliveryDate: dto.estimatedDeliveryDate
                ? new Date(dto.estimatedDeliveryDate)
                : null,
            }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
      },
      include: orderInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Order',
      entityId: order.id,
      action: 'UPDATE',
      before: {
        estimatedDeliveryDate: before.estimatedDeliveryDate,
        notes: before.notes,
        vatRate: before.vatRate,
      },
      after: {
        estimatedDeliveryDate: order.estimatedDeliveryDate,
        notes: order.notes,
        vatRate: order.vatRate,
      },
    });

    return order;
  }

  // "Enviar a producción" (ADR 0012): el pedido pasa a EN_PRODUCCION y en
  // la misma transacción se crea una orden de producción por línea, que
  // aparece en la pestaña Producción. Ninguna mueve stock todavía: lo
  // producido entra al completarlas. El `updateMany` con `status:
  // 'PENDIENTE'` en el where es el guard atómico contra enviarlo dos veces
  // (la que pierde no encuentra filas y recibe un 409).
  async markProduction(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.status !== 'PENDIENTE') {
      throw new BadRequestException(
        `El pedido está en estado ${before.status}, no se puede marcar en producción`,
      );
    }

    await this.prisma.$transaction(async (tx: TransactionClient) => {
      const result = await tx.order.updateMany({
        where: { id, status: 'PENDIENTE' },
        data: { status: 'EN_PRODUCCION', productionStartedAt: new Date() },
      });
      if (result.count === 0) {
        this.logger.warn(
          `Guard atómico: el pedido ${id} ya cambió de estado antes de marcarlo en producción`,
        );
        throw new ConflictException(
          'El pedido cambió de estado antes de poder marcarlo en producción, intenta de nuevo',
        );
      }
      await tx.productionOrder.createMany({
        data: before.items.map((item) => ({
          productId: item.productId,
          warehouseId: before.warehouseId,
          quantity: item.quantity,
          userId: actingUserId,
          orderId: before.id,
          orderItemId: item.id,
        })),
      });
    });

    const order = await this.findOne(id);
    await this.audit.log({
      userId: actingUserId,
      entity: 'Order',
      entityId: order.id,
      action: 'MARK_PRODUCTION',
      before: { status: before.status },
      after: {
        status: order.status,
        productionStartedAt: order.productionStartedAt,
      },
    });

    return order;
  }

  // Atajo para completar de una vez toda la producción de un pedido, cada
  // orden con lo planeado (el día a día va por la pestaña Producción, donde
  // se pide cuánto salió bueno). Usa el mismo completar que esa pestaña
  // (completeProductionOrderInTx) y, terminadas todas, el pedido pasa a
  // almacén. Un pedido en producción sin órdenes (no debería existir: la
  // migración de ADR 0012 se las creó a los que ya estaban) recibe las
  // suyas acá mismo. Serializable + P2034/P2028 (ADR 0001, #91).
  async markWarehoused(id: string, actingUserId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, productionOrders: true },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    if (order.status !== 'EN_PRODUCCION') {
      throw new BadRequestException(
        `El pedido está en estado ${order.status}, no se puede marcar enviado a almacén`,
      );
    }

    try {
      const updated = await this.prisma.$transaction(
        async (tx: TransactionClient) => {
          const withOrder = new Set(
            order.productionOrders.map((production) => production.orderItemId),
          );
          const missing = order.items.filter((item) => !withOrder.has(item.id));
          if (missing.length > 0) {
            await tx.productionOrder.createMany({
              data: missing.map((item) => ({
                productId: item.productId,
                warehouseId: order.warehouseId,
                quantity: item.quantity,
                userId: actingUserId,
                orderId: order.id,
                orderItemId: item.id,
              })),
            });
          }
          const pending = await tx.productionOrder.findMany({
            where: { orderId: order.id, status: 'PENDIENTE' },
          });
          for (const production of pending) {
            await completeProductionOrderInTx(
              tx,
              this.inventory,
              production,
              production.quantity,
              `Producción terminada, pedido No. ${order.number}`,
              actingUserId,
            );
          }

          if (!(await warehouseOrderWhenProductionDone(tx, order.id))) {
            this.logger.warn(
              `Guard atómico: el pedido ${order.id} ya cambió de estado antes de marcarlo enviado a almacén`,
            );
            throw new ConflictException(
              'El pedido cambió de estado antes de poder marcarlo enviado a almacén, intenta de nuevo',
            );
          }

          return tx.order.findUniqueOrThrow({
            where: { id: order.id },
            include: orderInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      await this.audit.log({
        userId: actingUserId,
        entity: 'Order',
        entityId: updated.id,
        action: 'MARK_WAREHOUSED',
        before: { status: order.status },
        after: { status: updated.status, warehousedAt: updated.warehousedAt },
      });

      return updated;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2028')
      ) {
        this.logger.warn(
          `Conflicto de concurrencia marcando el pedido ${order.id} enviado a almacén (${error.code}) — el cliente reintentará`,
        );
        throw new ConflictException(
          'Conflicto al marcar el pedido enviado a almacén, intenta de nuevo',
        );
      }
      throw error;
    }
  }

  // #97 se filtró antes del pivote de fabricación sobre pedido (#68-73) y
  // asumía que crear un pedido descontaba stock de inmediato (diseño
  // original #50/#51) — ya no es así (ver comentario de Order en
  // schema.prisma), así que cancelar no necesita revertir ningún
  // movimiento: PENDIENTE/EN_PRODUCCION nunca tocaron stock, y si ya está
  // EN_ALMACEN, el terminado que entró (ENTRADA, ver markWarehoused) es un
  // hecho real del ledger append-only (ADR 0001) — reescribirlo sería
  // falsificar el Kardex, no revertir una venta. El stock ya producido
  // sigue siendo inventario válido, solo deja de estar atado a este pedido.
  // Lo único que sí bloquea cancelar es que ya exista una Remission activa
  // (no anulada, ver #99): en ese punto la mercancía físicamente salió del
  // almacén hacia el cliente (SALIDA real, ver RemissionsService.create),
  // y cancelar el pedido no puede deshacer eso — pero si esa remisión
  // después se anula, su reverso ya corrigió el stock, y el pedido debe
  // volver a poder cancelarse. `remissions: { none: { voidedAt: null } }`
  // en el where hace ese chequeo atómico junto con el de estado, mismo
  // espíritu que markProduction: un solo `updateMany`, sin Serializable
  // porque no hay ningún StockMovement que escribir acá.
  async cancel(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.status === 'CANCELADO') {
      throw new BadRequestException('El pedido ya está cancelado');
    }
    if (before.remissions.some((remission) => !remission.voidedAt)) {
      throw new BadRequestException(
        'No se puede cancelar un pedido que ya tiene remisiones (mercancía despachada)',
      );
    }

    // Lo que todavía no se produjo deja de producirse (ADR 0012): sus
    // órdenes pendientes se cancelan con el pedido. Las ya completadas
    // quedan: lo producido es inventario real.
    await this.prisma.$transaction(async (tx: TransactionClient) => {
      const result = await tx.order.updateMany({
        where: {
          id,
          status: { notIn: ['CANCELADO', 'DESPACHADO'] },
          remissions: { none: { voidedAt: null } },
        },
        data: { status: 'CANCELADO', cancelledAt: new Date() },
      });
      if (result.count === 0) {
        this.logger.warn(
          `Guard atómico: el pedido ${id} ya cambió de estado o tiene una remisión activa antes de poder cancelarlo`,
        );
        throw new ConflictException(
          'El pedido cambió de estado antes de poder cancelarlo, intenta de nuevo',
        );
      }
      await tx.productionOrder.updateMany({
        where: { orderId: id, status: 'PENDIENTE' },
        data: { status: 'CANCELADA' },
      });
    });

    const order = await this.findOne(id);
    await this.audit.log({
      userId: actingUserId,
      entity: 'Order',
      entityId: order.id,
      action: 'CANCEL',
      before: { status: before.status },
      after: { status: order.status },
    });

    return order;
  }
}
