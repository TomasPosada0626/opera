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

type TransactionClient = Prisma.TransactionClient;

interface MaterialShortage {
  componentId: string;
  componentName: string;
  required: string;
  available: string;
}

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

  // `search` busca por número de pedido (entero exacto), mismo criterio que
  // RemissionsService.findAll: un texto no numérico devuelve una página
  // vacía en vez de ignorarse.
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
    const parsedNumber = search !== undefined ? Number(search) : undefined;
    // overdue va dentro de AND porque también restringe `status` — así se
    // combina con ?status= en vez de pisarlo.
    const where: Prisma.OrderWhereInput = {
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
      ...(search !== undefined
        ? { number: Number.isInteger(parsedNumber) ? parsedNumber : -1 }
        : {}),
      ...(overdue ? { AND: [overdueWhere()] } : {}),
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

    const order = await this.prisma.order.update({
      where: { id },
      data: {
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
      },
      after: {
        estimatedDeliveryDate: order.estimatedDeliveryDate,
        notes: order.notes,
      },
    });

    return order;
  }

  // Bandera manual + timestamp, sin movimiento de stock — el consumo de
  // materia prima (si el producto tiene lista de materiales) ocurre al
  // pasar a almacén, cuando el terminado de verdad existe (ver
  // markWarehoused). `updateMany` con `status: 'PENDIENTE'` en el where (no un
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
      this.logger.warn(
        `Guard atómico: el pedido ${id} ya cambió de estado antes de marcarlo en producción`,
      );
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
  // completa pedida) — antes de esto no existía físicamente. Si el producto
  // tiene lista de materiales, en la MISMA transacción se descuentan sus
  // materias primas (SALIDA por componente, al costo promedio vigente) y el
  // terminado entra con ese costo — mismo cálculo que
  // ProductionOrdersService.complete() (ADR 0002/0009). Sin lista de
  // materiales entra sin consumir nada y sin costo propio, como antes del
  // ADR 0009: la lista es opcional por producto a propósito. Falta de
  // material = 400 con el detalle, nunca stock negativo.
  // Serializable (ADR 0001) + el mismo manejo de P2034/P2028 que el resto
  // de transacciones del proyecto. El e2e de concurrencia real (#91) probó
  // que Serializable solo NO basta: un `update` incondicional deja pasar
  // más de una llamada cuando las transacciones no llegan a solaparse de
  // verdad en Postgres (p.ej. bajo contención del pool de conexiones en
  // CI), porque nunca releen el estado dentro de la transacción. El
  // `updateMany` con `status: 'EN_PRODUCCION'` en el where es el guard
  // atómico real — mismo patrón que markProduction/cancel — y Serializable
  // queda como red adicional para conflictos genuinos de lectura
  // concurrente (getStock, etc.).
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
          const unitCostByProduct = await this.consumeBillsOfMaterials(
            tx,
            order,
            actingUserId,
          );

          // Un solo createMany para todas las líneas del pedido en vez de
          // un create por línea dentro del for — menos tiempo con locks
          // abiertos dentro de la transacción Serializable (señalado en la
          // re-auditoría de escalabilidad).
          await tx.stockMovement.createMany({
            data: order.items.map((item) => ({
              productId: item.productId,
              warehouseId: order.warehouseId,
              type: 'ENTRADA' as const,
              quantity: item.quantity,
              unitCost: unitCostByProduct.get(item.productId),
              reason: `Producción terminada, pedido No. ${order.number}`,
              userId: actingUserId,
            })),
          });

          const result = await tx.order.updateMany({
            where: { id: order.id, status: 'EN_PRODUCCION' },
            data: { status: 'EN_ALMACEN', warehousedAt: new Date() },
          });
          if (result.count === 0) {
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

  // Descuenta, dentro de la transacción del llamador, las materias primas
  // de las líneas cuyo producto tiene lista de materiales activa, y
  // devuelve el costo unitario resultante de cada uno de esos productos
  // (los que no tienen lista no aparecen en el Map). Lecturas agrupadas
  // para todos los componentes del pedido a la vez, mismo batching que
  // ProductionOrdersService.complete(): un mismo componente puede
  // necesitarse en varias líneas, y el faltante se calcula sobre el total.
  private async consumeBillsOfMaterials(
    tx: TransactionClient,
    order: {
      id: string;
      number: number;
      warehouseId: string;
      items: { productId: string; quantity: Prisma.Decimal }[];
    },
    actingUserId: string,
  ): Promise<Map<string, Prisma.Decimal>> {
    const productIds = [...new Set(order.items.map((item) => item.productId))];
    const boms = await tx.billOfMaterials.findMany({
      where: { productId: { in: productIds }, isActive: true },
      include: { items: { include: { component: true } } },
    });
    const bomByProduct = new Map(
      boms
        .filter((bom) => bom.items.length > 0)
        .map((bom) => [bom.productId, bom]),
    );
    if (bomByProduct.size === 0) {
      return new Map();
    }

    const required = new Map<
      string,
      { name: string; quantity: Prisma.Decimal }
    >();
    for (const item of order.items) {
      const bom = bomByProduct.get(item.productId);
      for (const bomItem of bom?.items ?? []) {
        const current = required.get(bomItem.componentId) ?? {
          name: bomItem.component.name,
          quantity: new Prisma.Decimal(0),
        };
        current.quantity = current.quantity.plus(
          bomItem.quantity.times(item.quantity),
        );
        required.set(bomItem.componentId, current);
      }
    }

    const componentIds = [...required.keys()];
    const [stockByComponent, costByComponent] = await Promise.all([
      this.inventory.getStockForProducts(componentIds, order.warehouseId, tx),
      this.inventory.getAverageCostForProducts(
        componentIds,
        order.warehouseId,
        tx,
      ),
    ]);
    const stockById = new Map(
      stockByComponent.map(({ productId, stock }) => [productId, stock]),
    );

    const shortages: MaterialShortage[] = [];
    for (const [componentId, { name, quantity }] of required) {
      const available = stockById.get(componentId) ?? new Prisma.Decimal(0);
      if (available.lessThan(quantity)) {
        shortages.push({
          componentId,
          componentName: name,
          required: quantity.toString(),
          available: available.toString(),
        });
      }
    }
    if (shortages.length > 0) {
      this.logger.warn(
        `Pedido ${order.id} no pasó a almacén: ${shortages.length} material(es) sin stock suficiente`,
      );
      throw new BadRequestException({
        message:
          'No hay suficiente materia prima en la bodega para pasar este pedido a almacén',
        shortages,
      });
    }

    await tx.stockMovement.createMany({
      data: Array.from(required, ([componentId, { quantity }]) => ({
        productId: componentId,
        warehouseId: order.warehouseId,
        type: 'SALIDA' as const,
        quantity: quantity.negated(),
        unitCost: costByComponent.get(componentId) ?? new Prisma.Decimal(0),
        reason: `Consumo de materiales, pedido No. ${order.number}`,
        userId: actingUserId,
      })),
    });

    const unitCostByProduct = new Map<string, Prisma.Decimal>();
    for (const [productId, bom] of bomByProduct) {
      unitCostByProduct.set(
        productId,
        bom.items.reduce(
          (sum, bomItem) =>
            sum.plus(
              bomItem.quantity.times(
                costByComponent.get(bomItem.componentId) ??
                  new Prisma.Decimal(0),
              ),
            ),
          new Prisma.Decimal(0),
        ),
      );
    }
    return unitCostByProduct;
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

    const result = await this.prisma.order.updateMany({
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
