import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RemissionPaymentStatus } from '@prisma/client';
import { renderRemissionPdf } from './remission-pdf';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateRemissionDto } from './dto/create-remission.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListRemissionsDto } from './dto/list-remissions.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';
import { VoidRemissionDto } from './dto/void-remission.dto';
import {
  formatRemissionNumber,
  parseRemissionNumber,
} from './remission-number';
import { vatAmountFor } from '../orders/vat';

type TransactionClient = Prisma.TransactionClient;
const remissionInclude = {
  order: { include: { customer: true, warehouse: true } },
  user: { select: { id: true, name: true } },
  // product.unit: la columna UNID EMP de la remisión impresa (millar o
  // unidad, ver remission-pdf.ts).
  items: {
    include: {
      orderItem: { include: { product: { include: { unit: true } } } },
    },
  },
  payments: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { paidAt: 'asc' as const },
  },
};
const sortableFields = ['createdAt', 'number'] as const;

interface Overage {
  orderItemId: string;
  productName: string;
  requested: string;
  remaining: string;
}

interface Shortage {
  productId: string;
  productName: string;
  required: string;
  available: string;
}

// La única regla de estado de pago del sistema: se deriva de lo abonado
// contra el total, nunca se elige a mano. Exportada para que los tests y
// cualquier otro módulo usen exactamente la misma.
export function paymentStatusFor(
  total: Prisma.Decimal,
  amountPaid: Prisma.Decimal,
): RemissionPaymentStatus {
  if (amountPaid.greaterThanOrEqualTo(total)) {
    return 'PAGADO';
  }
  return amountPaid.greaterThan(0) ? 'ABONADO' : 'CARTERA';
}

function formatMoney(value: Prisma.Decimal): string {
  return Number(value).toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

@Injectable()
export class RemissionsService {
  private readonly logger = new Logger(RemissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  // `number` es un Int autoincremental, no texto — igual que en
  // SearchService (#77), solo matchea si `search` es exactamente un
  // entero. Un `search` no numérico devuelve una página vacía en vez de
  // ignorarse, para no confundir "no encontré nada" con "no filtré nada".
  // paymentStatus/customerId permiten armar la vista de cobro ("qué me
  // deben y quién") sin traer todas las remisiones al cliente.
  findAll(query: ListRemissionsDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'desc',
      search,
      paymentStatus,
      customerId,
    } = query;
    const orderBy = resolveOrderBy(
      sortBy,
      sortOrder,
      sortableFields,
      'createdAt',
    );
    // "HT 3285" o "3285": el número tal como sale impreso también sirve.
    const parsedNumber =
      search !== undefined ? parseRemissionNumber(search) : null;
    const filters: Prisma.RemissionWhereInput = {
      ...(search !== undefined ? { number: parsedNumber ?? -1 } : {}),
      ...(paymentStatus ? { paymentStatus, voidedAt: null } : {}),
      ...(customerId ? { order: { customerId } } : {}),
    };
    const where = Object.keys(filters).length > 0 ? filters : undefined;

    return paginate(
      () => this.prisma.remission.count({ where }),
      ({ skip, take }) =>
        this.prisma.remission.findMany({
          where,
          include: remissionInclude,
          orderBy,
          skip,
          take,
        }),
      page,
      pageSize,
    );
  }

  async findOne(id: string) {
    const remission = await this.prisma.remission.findUnique({
      where: { id },
      include: remissionInclude,
    });
    if (!remission) {
      throw new NotFoundException('Remisión no encontrada');
    }

    return remission;
  }

  // Crear una remisión ES el hecho de despachar (ver schema.prisma) — y a
  // diferencia del diseño original, ahora es el momento en que el stock de
  // verdad sale del almacén (el pedido ya no lo descuenta al crearse). Dos
  // cosas que proteger dentro de la misma transacción Serializable: que lo
  // remisionado por línea de pedido no exceda lo pedido (ya existía), y que
  // el producto tenga stock real suficiente (nuevo) — ambas corren antes de
  // cualquier escritura. Se agrupa por productId, no por orderItemId, para
  // el chequeo de stock: dos líneas del mismo pedido pueden ser el mismo
  // producto a precios distintos (ver OrderItem), y ambas consumen del
  // mismo stock físico. Serializable + P2034/P2028 tratados igual, mismo
  // patrón que OrdersService.markWarehoused() y
  // ProductionOrdersService.complete() (#33). En la misma transacción: el
  // abono inicial (si el cliente pagó al recibir) y el paso del pedido a
  // DESPACHADO cuando esta remisión completa lo pedido.
  async create(dto: CreateRemissionDto, actingUserId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { items: { include: { product: true } } },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    // Solo se despacha stock real de un pedido que de verdad llegó a
    // almacén — uno PENDIENTE/EN_PRODUCCION nunca pasó por markWarehoused
    // (no hay stock suyo que despachar), y uno CANCELADO no debe poder
    // "revivir" como una entrega real (encontrado en revisión de seguridad
    // de cierre de M6, #80). Uno DESPACHADO ya no tiene nada pendiente.
    if (order.status !== 'EN_ALMACEN') {
      throw new BadRequestException(
        order.status === 'DESPACHADO'
          ? 'Este pedido ya se despachó por completo'
          : 'Solo se puede despachar un pedido que ya está en almacén',
      );
    }

    const orderItemById = new Map(order.items.map((item) => [item.id, item]));
    // Cantidad total pedida por línea EN ESTA MISMA solicitud, no solo la
    // del renglón actual — un `orderItemId` repetido en `dto.items` no debe
    // poder validarse dos veces contra el mismo `remaining` ya calculado
    // (encontrado en revisión de seguridad de cierre de M6, #80).
    const requestedByOrderItem = new Map<string, Prisma.Decimal>();
    for (const item of dto.items) {
      if (!orderItemById.has(item.orderItemId)) {
        throw new NotFoundException(
          `Línea de pedido ${item.orderItemId} no encontrada en este pedido`,
        );
      }
      const current =
        requestedByOrderItem.get(item.orderItemId) ?? new Prisma.Decimal(0);
      requestedByOrderItem.set(item.orderItemId, current.plus(item.quantity));
    }

    let subtotal = new Prisma.Decimal(0);
    for (const [orderItemId, requested] of requestedByOrderItem) {
      subtotal = subtotal.plus(
        requested.times(orderItemById.get(orderItemId)!.unitPrice),
      );
    }
    // Lo que el cliente debe por esta remisión (cartera, abonos) lleva el
    // IVA del pedido incluido.
    const vatAmount = vatAmountFor(subtotal, order.vatRate);
    const total = subtotal.plus(vatAmount);
    const initialPayment = dto.initialPayment;
    if (initialPayment && total.lessThan(initialPayment.amount)) {
      throw new BadRequestException(
        `El pago (${formatMoney(new Prisma.Decimal(initialPayment.amount))}) supera el total de la remisión (${formatMoney(total)})`,
      );
    }

    try {
      const remission = await this.prisma.$transaction(
        async (tx: TransactionClient) => {
          // Un solo groupBy para TODAS las líneas del pedido en vez de un
          // aggregate por orderItemId dentro del for — mismo motivo que el
          // batching en ProductionOrdersService.complete(): menos tiempo
          // con locks abiertos dentro de la transacción Serializable, menos
          // contención real entre despachos concurrentes (señalado en la
          // auditoría de escalabilidad). Todas las líneas, no solo las de
          // este request, para saber al final si el pedido quedó completo.
          // remission.voidedAt: null excluye remisiones anuladas (#99) —
          // una vez anulada, su cantidad deja de contar como "entregado" y
          // el pedido vuelve a admitir un despacho correcto por esa
          // cantidad.
          const deliveredGrouped = await tx.remissionItem.groupBy({
            by: ['orderItemId'],
            where: {
              orderItemId: { in: order.items.map((item) => item.id) },
              remission: { voidedAt: null },
            },
            _sum: { quantity: true },
          });
          const deliveredByOrderItem = new Map(
            deliveredGrouped.map(({ orderItemId, _sum }) => [
              orderItemId,
              _sum.quantity ?? new Prisma.Decimal(0),
            ]),
          );

          const overages: Overage[] = [];
          for (const [orderItemId, requested] of requestedByOrderItem) {
            const orderItem = orderItemById.get(orderItemId)!;
            const alreadyDelivered =
              deliveredByOrderItem.get(orderItemId) ?? new Prisma.Decimal(0);
            const remaining = orderItem.quantity.minus(alreadyDelivered);
            if (requested.greaterThan(remaining)) {
              overages.push({
                orderItemId,
                productName: orderItem.product.name,
                requested: requested.toString(),
                remaining: remaining.toString(),
              });
            }
          }
          if (overages.length > 0) {
            this.logger.warn(
              `Remisión del pedido ${order.id} rechazada: ${overages.length} línea(s) exceden lo pendiente por entregar`,
            );
            throw new BadRequestException({
              message:
                'La cantidad a remisionar excede lo pendiente por entregar',
              overages,
            });
          }

          const quantityByProduct = new Map<string, Prisma.Decimal>();
          for (const item of dto.items) {
            const orderItem = orderItemById.get(item.orderItemId)!;
            const current =
              quantityByProduct.get(orderItem.productId) ??
              new Prisma.Decimal(0);
            quantityByProduct.set(
              orderItem.productId,
              current.plus(item.quantity),
            );
          }

          const shortages: Shortage[] = [];
          for (const [productId, requested] of quantityByProduct) {
            const available = await this.inventory.getStock(
              productId,
              order.warehouseId,
              tx,
            );
            if (available.lessThan(requested)) {
              const orderItem = order.items.find(
                (item) => item.productId === productId,
              )!;
              shortages.push({
                productId,
                productName: orderItem.product.name,
                required: requested.toString(),
                available: available.toString(),
              });
            }
          }
          if (shortages.length > 0) {
            this.logger.warn(
              `Remisión del pedido ${order.id} rechazada por stock insuficiente: ${shortages.length} producto(s) en falta`,
            );
            throw new BadRequestException({
              message: 'Stock insuficiente para despachar esta remisión',
              shortages,
            });
          }

          const amountPaid = new Prisma.Decimal(initialPayment?.amount ?? 0);
          const created = await tx.remission.create({
            data: {
              orderId: dto.orderId,
              userId: actingUserId,
              subtotal,
              vatAmount,
              total,
              amountPaid,
              paymentStatus: paymentStatusFor(total, amountPaid),
              items: {
                create: dto.items.map((item) => ({
                  orderItemId: item.orderItemId,
                  quantity: item.quantity,
                })),
              },
              ...(initialPayment
                ? {
                    payments: {
                      create: {
                        amount: initialPayment.amount,
                        method: initialPayment.method,
                        paidAt: initialPayment.paidAt
                          ? new Date(initialPayment.paidAt)
                          : new Date(),
                        note: initialPayment.note?.trim() || undefined,
                        userId: actingUserId,
                      },
                    },
                  }
                : {}),
            },
          });

          // Un solo createMany para todos los productos despachados en vez
          // de un create por producto dentro del for — menos tiempo con
          // locks abiertos dentro de la transacción Serializable (señalado
          // en la re-auditoría de escalabilidad). Después de crear la
          // remisión para que el Kardex cite su número, no un UUID.
          await tx.stockMovement.createMany({
            data: Array.from(quantityByProduct, ([productId, quantity]) => ({
              productId,
              warehouseId: order.warehouseId,
              type: 'SALIDA' as const,
              quantity: quantity.negated(),
              reason: `Despacho, remisión ${formatRemissionNumber(created.number)} del pedido No. ${order.number}`,
              userId: actingUserId,
            })),
          });

          const isFullyDispatched = order.items.every((item) => {
            const delivered = (
              deliveredByOrderItem.get(item.id) ?? new Prisma.Decimal(0)
            ).plus(requestedByOrderItem.get(item.id) ?? 0);
            return delivered.greaterThanOrEqualTo(item.quantity);
          });
          if (isFullyDispatched) {
            await tx.order.updateMany({
              where: { id: order.id, status: 'EN_ALMACEN' },
              data: { status: 'DESPACHADO', dispatchedAt: new Date() },
            });
          }

          return tx.remission.findUniqueOrThrow({
            where: { id: created.id },
            include: remissionInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      await this.audit.log({
        userId: actingUserId,
        entity: 'Remission',
        entityId: remission.id,
        action: 'CREATE',
        after: remission,
      });

      return remission;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2028')
      ) {
        throw new ConflictException(
          'Conflicto al crear la remisión, intenta de nuevo',
        );
      }
      throw error;
    }
  }

  // Registra un abono real. El saldo pendiente se lee y se actualiza dentro
  // de la misma transacción Serializable: dos abonos simultáneos sobre la
  // misma remisión no pueden pasar ambos el chequeo de "no superar el
  // saldo" con el mismo amountPaid viejo (el segundo recibe 409).
  async addPayment(
    remissionId: string,
    dto: CreatePaymentDto,
    actingUserId: string,
  ) {
    try {
      const { remission, payment } = await this.prisma.$transaction(
        async (tx: TransactionClient) => {
          const current = await tx.remission.findUnique({
            where: { id: remissionId },
          });
          if (!current) {
            throw new NotFoundException('Remisión no encontrada');
          }
          if (current.voidedAt) {
            throw new BadRequestException(
              'No se pueden registrar abonos en una remisión anulada',
            );
          }
          const pending = current.total.minus(current.amountPaid);
          if (pending.lessThan(dto.amount)) {
            throw new BadRequestException(
              pending.lessThanOrEqualTo(0)
                ? 'Esta remisión ya está pagada por completo'
                : `El abono (${formatMoney(new Prisma.Decimal(dto.amount))}) supera el saldo pendiente (${formatMoney(pending)})`,
            );
          }

          const created = await tx.remissionPayment.create({
            data: {
              remissionId,
              amount: dto.amount,
              method: dto.method,
              paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
              note: dto.note?.trim() || undefined,
              userId: actingUserId,
            },
          });
          const amountPaid = current.amountPaid.plus(dto.amount);
          const updated = await tx.remission.update({
            where: { id: remissionId },
            data: {
              amountPaid,
              paymentStatus: paymentStatusFor(current.total, amountPaid),
            },
            include: remissionInclude,
          });
          return { remission: updated, payment: created };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      await this.audit.log({
        userId: actingUserId,
        entity: 'Remission',
        entityId: remission.id,
        action: 'ADD_PAYMENT',
        after: {
          paymentId: payment.id,
          amount: payment.amount,
          method: payment.method,
          paidAt: payment.paidAt,
          amountPaid: remission.amountPaid,
          paymentStatus: remission.paymentStatus,
        },
      });

      return remission;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2028')
      ) {
        throw new ConflictException(
          'Otro abono se registró al mismo tiempo, intenta de nuevo',
        );
      }
      throw error;
    }
  }

  // Anular un abono (registrado por error, cheque devuelto): queda en el
  // historial con su motivo y deja de contar. amountPaid se recalcula
  // sumando los abonos vigentes, no restando — así el resumen siempre
  // coincide con el historial aunque algo lo hubiera desfasado antes.
  async voidPayment(
    remissionId: string,
    paymentId: string,
    dto: VoidPaymentDto,
    actingUserId: string,
  ) {
    const remission = await this.prisma.$transaction(
      async (tx: TransactionClient) => {
        const result = await tx.remissionPayment.updateMany({
          where: { id: paymentId, remissionId, voidedAt: null },
          data: { voidedAt: new Date(), voidReason: dto.reason },
        });
        if (result.count === 0) {
          const exists = await tx.remissionPayment.findFirst({
            where: { id: paymentId, remissionId },
          });
          if (!exists) {
            throw new NotFoundException('Abono no encontrado');
          }
          throw new BadRequestException('El abono ya está anulado');
        }

        const current = await tx.remission.findUniqueOrThrow({
          where: { id: remissionId },
        });
        const { _sum } = await tx.remissionPayment.aggregate({
          where: { remissionId, voidedAt: null },
          _sum: { amount: true },
        });
        const amountPaid = _sum.amount ?? new Prisma.Decimal(0);
        return tx.remission.update({
          where: { id: remissionId },
          data: {
            amountPaid,
            paymentStatus: paymentStatusFor(current.total, amountPaid),
          },
          include: remissionInclude,
        });
      },
    );

    await this.audit.log({
      userId: actingUserId,
      entity: 'Remission',
      entityId: remission.id,
      action: 'VOID_PAYMENT',
      after: {
        paymentId,
        voidReason: dto.reason,
        amountPaid: remission.amountPaid,
        paymentStatus: remission.paymentStatus,
      },
    });

    return remission;
  }

  // #99: corregir una remisión con cantidad equivocada no edita ni borra
  // la fila ni el StockMovement que generó (ambos append-only, ver ADR
  // 0001) — se anula. La fila queda con el motivo, y se escribe una
  // ENTRADA de reverso por producto (agrupado igual que create(), un
  // mismo producto puede repetirse en varias líneas) para corregir el
  // stock. Guard atómico (`updateMany` con `voidedAt: null` en el where)
  // para que dos anulaciones concurrentes de la misma remisión no generen
  // dos reversos — mismo patrón que OrdersService.markProduction. Sin
  // Serializable: escribir una ENTRADA nunca falla por sobregiro (a
  // diferencia de una SALIDA), así que no hay una decisión de stock que
  // proteger, solo el guard de "no anular dos veces".
  // Con abonos vigentes no se anula: esa plata la recibió el negocio, y si
  // la remisión dejara de contar, el saldo del cliente subiría como si no
  // hubiera pagado. Primero se anulan los abonos (y se registran en la
  // remisión corregida). Si el pedido estaba DESPACHADO, vuelve a
  // EN_ALMACEN: lo anulado vuelve a estar pendiente de entregar.
  async voidRemission(id: string, dto: VoidRemissionDto, actingUserId: string) {
    const remission = await this.findOne(id);
    if (remission.voidedAt) {
      throw new BadRequestException('La remisión ya está anulada');
    }
    if (remission.payments.some((payment) => !payment.voidedAt)) {
      throw new BadRequestException(
        'Esta remisión tiene abonos registrados. Anúlalos primero y regístralos en la remisión corregida.',
      );
    }

    const voided = await this.prisma.$transaction(
      async (tx: TransactionClient) => {
        const result = await tx.remission.updateMany({
          where: { id, voidedAt: null, payments: { none: { voidedAt: null } } },
          data: { voidedAt: new Date(), voidReason: dto.reason },
        });
        if (result.count === 0) {
          this.logger.warn(
            `Guard atómico: la remisión ${id} ya fue anulada (o recibió un abono) antes de esta solicitud`,
          );
          throw new ConflictException(
            'La remisión cambió antes de poder anularla, intenta de nuevo',
          );
        }

        const quantityByProduct = new Map<string, Prisma.Decimal>();
        for (const item of remission.items) {
          const { productId } = item.orderItem;
          const current =
            quantityByProduct.get(productId) ?? new Prisma.Decimal(0);
          quantityByProduct.set(productId, current.plus(item.quantity));
        }
        // Mismo motivo que en create(): un solo createMany en vez de un
        // create por producto dentro del for.
        await tx.stockMovement.createMany({
          data: Array.from(quantityByProduct, ([productId, quantity]) => ({
            productId,
            warehouseId: remission.order.warehouseId,
            type: 'ENTRADA' as const,
            quantity,
            reason: `Anulación de remisión ${formatRemissionNumber(remission.number)}: ${dto.reason}`,
            userId: actingUserId,
          })),
        });

        await tx.order.updateMany({
          where: { id: remission.orderId, status: 'DESPACHADO' },
          data: { status: 'EN_ALMACEN', dispatchedAt: null },
        });

        return tx.remission.findUniqueOrThrow({
          where: { id },
          include: remissionInclude,
        });
      },
    );

    await this.audit.log({
      userId: actingUserId,
      entity: 'Remission',
      entityId: voided.id,
      action: 'VOID',
      before: { voidedAt: null },
      after: { voidedAt: voided.voidedAt, voidReason: voided.voidReason },
    });

    return voided;
  }

  // pdfkit arma el PDF como un stream de chunks en vez de un archivo en
  // disco — no hay nada que limpiar después ni una carpeta de "remisiones
  // temporales" que mantener; el PDF se genera al vuelo en cada request.
  // Devuelve el número junto con el buffer para que el controller arme el
  // nombre del archivo sin pedir la remisión una segunda vez. Dos copias en
  // una hoja carta, con el formato en papel de Herrajes Toro (ver
  // remission-pdf.ts).
  async generatePdf(id: string): Promise<{ buffer: Buffer; number: number }> {
    const remission = await this.findOne(id);
    const buffer = await renderRemissionPdf(remission);

    return { buffer, number: remission.number };
  }
}
