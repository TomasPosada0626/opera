import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';

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

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(query: ListOrdersDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'desc',
      status,
      customerId,
    } = query;
    const orderBy = resolveOrderBy(
      sortBy,
      sortOrder,
      sortableFields,
      'createdAt',
    );
    const where: Prisma.OrderWhereInput = {
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
    };

    return paginate(
      () => this.prisma.order.count({ where }),
      ({ skip, take }) =>
        this.prisma.order.findMany({
          where,
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

    const order = await this.prisma.order.create({
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

    await this.audit.log({
      userId: actingUserId,
      entity: 'Order',
      entityId: order.id,
      action: 'CREATE',
      after: order,
    });

    return order;
  }

  // Bandera manual + timestamp, sin movimiento de stock — no se consume
  // materia prima por receta (imposible de calcular de forma confiable por
  // la variación entre pedidos y la pérdida de material, decisión del
  // negocio). `updateMany` con `status: 'PENDIENTE'` en el where (no un
  // findUnique + update separado) hace la transición atómica: Postgres ya
  // garantiza que un UPDATE individual es atómico a nivel de fila en
  // cualquier nivel de aislamiento, así que dos llamadas concurrentes nunca
  // la disparan dos veces — la que pierde simplemente no encuentra filas
  // que actualizar (count 0) y recibe un 409, sin necesitar una transacción
  // Serializable de por medio (a diferencia de markWarehoused, que sí
  // escribe StockMovement y necesita esa protección más fuerte).
  async markProduction(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.status !== 'PENDIENTE') {
      throw new BadRequestException(
        `El pedido está en estado ${before.status}, no se puede marcar en producción`,
      );
    }

    const result = await this.prisma.order.updateMany({
      where: { id, status: 'PENDIENTE' },
      data: { status: 'EN_PRODUCCION', productionStartedAt: new Date() },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'El pedido cambió de estado antes de poder marcarlo en producción, intenta de nuevo',
      );
    }

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

  // El terminado entra al stock de verdad acá (ENTRADA por línea, cantidad
  // completa pedida) — antes de esto no existía físicamente. Sí necesita
  // Serializable + el mismo manejo de P2034/P2028 que el resto de
  // transacciones del proyecto (ver ADR 0001): escribe N StockMovement más
  // el cambio de estado como una sola unidad, y dos llamadas concurrentes
  // sobre el mismo pedido (misma fila de Order) deben dejar pasar solo una
  // — mismo mecanismo que protege a ProductionOrdersService.complete()
  // contra un doble-completado (#91): el chequeo previo de estado atrapa el
  // caso común sin carrera, y el conflicto de serialización de Postgres
  // atrapa la carrera real bajo concurrencia genuina.
  async markWarehoused(id: string, actingUserId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
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
          for (const item of order.items) {
            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                warehouseId: order.warehouseId,
                type: 'ENTRADA',
                quantity: item.quantity,
                reason: `Producción terminada, pedido ${order.id}`,
                userId: actingUserId,
              },
            });
          }

          return tx.order.update({
            where: { id: order.id },
            data: { status: 'EN_ALMACEN', warehousedAt: new Date() },
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
  // Lo único que sí bloquea cancelar es que ya exista una Remission: en ese
  // punto la mercancía físicamente salió del almacén hacia el cliente
  // (SALIDA real, ver RemissionsService.create), y cancelar el pedido no
  // puede deshacer eso. `remissions: { none: {} }` en el where hace ese
  // chequeo atómico junto con el de estado, mismo espíritu que
  // markProduction: un solo `updateMany`, sin Serializable porque no hay
  // ningún StockMovement que escribir acá.
  async cancel(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    if (before.status === 'CANCELADO') {
      throw new BadRequestException('El pedido ya está cancelado');
    }
    if (before.remissions.length > 0) {
      throw new BadRequestException(
        'No se puede cancelar un pedido que ya tiene remisiones (mercancía despachada)',
      );
    }

    const result = await this.prisma.order.updateMany({
      where: { id, status: { not: 'CANCELADO' }, remissions: { none: {} } },
      data: { status: 'CANCELADO' },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'El pedido cambió de estado antes de poder cancelarlo, intenta de nuevo',
      );
    }

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
