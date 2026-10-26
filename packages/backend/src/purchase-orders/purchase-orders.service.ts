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
import { CreatePaymentDto } from '../remissions/dto/create-payment.dto';
import { VoidPaymentDto } from '../remissions/dto/void-payment.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import {
  payableOf,
  receivedValueOf,
  supplierPaymentStatusFor,
} from './payables';

type TransactionClient = Prisma.TransactionClient;
type Decimal = Prisma.Decimal;
const { Decimal } = Prisma;

const userSummary = { select: { id: true, name: true } };

const purchaseOrderInclude = {
  supplier: true,
  warehouse: true,
  user: userSummary,
  items: {
    orderBy: { position: 'asc' as const },
    include: {
      product: { include: { unit: true } },
      receipts: {
        orderBy: { receivedAt: 'asc' as const },
        include: { user: userSummary },
      },
    },
  },
  payments: {
    orderBy: { paidAt: 'asc' as const },
    include: { user: userSummary },
  },
} satisfies Prisma.PurchaseOrderInclude;

type PurchaseOrderWithRelations = Prisma.PurchaseOrderGetPayload<{
  include: typeof purchaseOrderInclude;
}>;

const sortableFields = ['purchasedAt', 'number', 'createdAt'] as const;

function withSummary(order: PurchaseOrderWithRelations) {
  return {
    ...order,
    receivedValue: receivedValueOf(order.items),
    payable: payableOf(order),
    paymentStatus: supplierPaymentStatusFor(order),
  };
}

function formatMoney(value: Decimal): string {
  return Number(value).toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

function isSerializationFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || error.code === 'P2028')
  );
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreatePurchaseOrderDto, actingUserId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado');
    }
    if (!supplier.isActive) {
      throw new BadRequestException('El proveedor está desactivado');
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
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'Hay un producto repetido en la compra: súmalo en una sola línea',
      );
    }
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const missing = productIds.filter(
      (id) => !products.some((product) => product.id === id),
    );
    if (missing.length > 0) {
      throw new NotFoundException('Producto no encontrado');
    }
    const inactive = products.find((product) => !product.isActive);
    if (inactive) {
      throw new BadRequestException(
        `El producto ${inactive.name} está desactivado`,
      );
    }

    const total = dto.items.reduce(
      (sum, item) => sum.plus(new Decimal(item.quantity).times(item.unitCost)),
      new Decimal(0),
    );
    if (dto.initialPayment && total.lessThan(dto.initialPayment.amount)) {
      throw new BadRequestException(
        `El anticipo (${formatMoney(new Decimal(dto.initialPayment.amount))}) supera el valor de la compra (${formatMoney(total)})`,
      );
    }

    const order = await this.prisma.$transaction(
      async (tx: TransactionClient) => {
        const created = await tx.purchaseOrder.create({
          data: {
            supplierId: dto.supplierId,
            warehouseId: dto.warehouseId,
            purchasedAt: dto.purchasedAt
              ? new Date(dto.purchasedAt)
              : undefined,
            expectedDate: dto.expectedDate
              ? new Date(dto.expectedDate)
              : undefined,
            supplierInvoice: dto.supplierInvoice?.trim() || undefined,
            notes: dto.notes?.trim() || undefined,
            total,
            amountPaid: dto.initialPayment?.amount ?? 0,
            userId: actingUserId,
            items: {
              create: dto.items.map((item, position) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitCost: item.unitCost,
                position,
              })),
            },
          },
        });
        if (dto.initialPayment) {
          await tx.supplierPayment.create({
            data: {
              purchaseOrderId: created.id,
              amount: dto.initialPayment.amount,
              method: dto.initialPayment.method,
              paidAt: dto.initialPayment.paidAt
                ? new Date(dto.initialPayment.paidAt)
                : new Date(),
              note: dto.initialPayment.note?.trim() || undefined,
              userId: actingUserId,
            },
          });
        }
        return tx.purchaseOrder.findUniqueOrThrow({
          where: { id: created.id },
          include: purchaseOrderInclude,
        });
      },
    );

    await this.audit.log({
      userId: actingUserId,
      entity: 'PurchaseOrder',
      entityId: order.id,
      action: 'CREATE',
      after: order,
    });

    return withSummary(order);
  }

  async findAll(query: ListPurchaseOrdersDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'desc',
      search,
      status,
      supplierId,
      open,
    } = query;

    // `number` es un entero: solo filtra si `search` lo es, igual que en
    // remisiones; un texto no numérico devuelve una página vacía.
    const trimmed = search?.trim();
    const numberFilter = trimmed
      ? /^\d+$/.test(trimmed)
        ? { number: Number(trimmed) }
        : { id: { in: [] as string[] } }
      : {};

    const where: Prisma.PurchaseOrderWhereInput = {
      ...numberFilter,
      ...(supplierId ? { supplierId } : {}),
      ...(status ? { status } : {}),
      ...(open ? { status: { in: ['PENDIENTE', 'PARCIAL'] } } : {}),
    };
    const orderBy = resolveOrderBy(
      sortBy,
      sortOrder,
      sortableFields,
      'purchasedAt',
    );

    const result = await paginate(
      () => this.prisma.purchaseOrder.count({ where }),
      ({ skip, take }) =>
        this.prisma.purchaseOrder.findMany({
          where,
          include: purchaseOrderInclude,
          orderBy,
          skip,
          take,
        }),
      page,
      pageSize,
    );
    return { ...result, data: result.data.map(withSummary) };
  }

  async findOne(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: purchaseOrderInclude,
    });
    if (!order) {
      throw new NotFoundException('Compra no encontrada');
    }
    return withSummary(order);
  }

  async update(id: string, dto: UpdatePurchaseOrderDto, actingUserId: string) {
    const before = await this.prisma.purchaseOrder.findUnique({
      where: { id },
    });
    if (!before) {
      throw new NotFoundException('Compra no encontrada');
    }
    if (before.status === 'CANCELADA') {
      throw new BadRequestException('La compra está cancelada');
    }

    const data: Prisma.PurchaseOrderUpdateInput = {};
    if (dto.expectedDate !== undefined) {
      data.expectedDate = dto.expectedDate ? new Date(dto.expectedDate) : null;
    }
    if (dto.supplierInvoice !== undefined) {
      data.supplierInvoice = dto.supplierInvoice?.trim() || null;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes?.trim() || null;
    }

    const order = await this.prisma.purchaseOrder.update({
      where: { id },
      data,
      include: purchaseOrderInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'PurchaseOrder',
      entityId: id,
      action: 'UPDATE',
      before: {
        expectedDate: before.expectedDate,
        supplierInvoice: before.supplierInvoice,
        notes: before.notes,
      },
      after: {
        expectedDate: order.expectedDate,
        supplierInvoice: order.supplierInvoice,
        notes: order.notes,
      },
    });

    return withSummary(order);
  }

  // Llegada de mercancía, total o parcial: cada línea recibida es una
  // ENTRADA real del Kardex con el costo de la compra (entra al promedio
  // ponderado, ADR 0002). Serializable: dos recepciones simultáneas de la
  // misma compra no pueden pasar ambas el chequeo de "no recibir más de lo
  // pedido" con el mismo quantityReceived viejo (la segunda recibe 409).
  async receive(
    id: string,
    dto: ReceivePurchaseOrderDto,
    actingUserId: string,
  ) {
    const itemIds = dto.items.map((line) => line.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException('Hay una línea repetida en la recepción');
    }
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();

    try {
      const { order, received } = await this.prisma.$transaction(
        async (tx: TransactionClient) => {
          const current = await tx.purchaseOrder.findUnique({
            where: { id },
            include: { items: { include: { product: true } } },
          });
          if (!current) {
            throw new NotFoundException('Compra no encontrada');
          }
          if (current.status === 'CANCELADA') {
            throw new BadRequestException('La compra está cancelada');
          }
          if (current.status === 'CERRADA' || current.status === 'RECIBIDA') {
            throw new BadRequestException(
              'Esta compra ya no tiene nada pendiente por recibir',
            );
          }

          const lines = dto.items.map((line) => {
            const item = current.items.find((i) => i.id === line.itemId);
            if (!item) {
              throw new BadRequestException(
                'Una de las líneas no pertenece a esta compra',
              );
            }
            const pending = item.quantity.minus(item.quantityReceived);
            if (pending.lessThan(line.quantity)) {
              throw new BadRequestException(
                `De ${item.product.name} solo faltan ${pending.toString()} por recibir`,
              );
            }
            return { item, quantity: new Decimal(line.quantity) };
          });

          for (const { item, quantity } of lines) {
            const movement = await tx.stockMovement.create({
              data: {
                productId: item.productId,
                warehouseId: current.warehouseId,
                type: 'ENTRADA',
                quantity,
                unitCost: item.unitCost,
                reason: `Recepción de la compra No. ${current.number}`,
                userId: actingUserId,
                // Sin fecharla hacia atrás aunque la mercancía haya llegado
                // antes: el Kardex se lee en el orden en que se escribió
                // (ADR 0001/0002). La fecha declarada queda en el recibo.
              },
            });
            await tx.purchaseReceipt.create({
              data: {
                purchaseOrderItemId: item.id,
                quantity,
                stockMovementId: movement.id,
                receivedAt,
                userId: actingUserId,
              },
            });
            await tx.purchaseOrderItem.update({
              where: { id: item.id },
              data: { quantityReceived: item.quantityReceived.plus(quantity) },
            });
          }

          const items = await tx.purchaseOrderItem.findMany({
            where: { purchaseOrderId: id },
          });
          const complete = items.every((item) =>
            item.quantityReceived.greaterThanOrEqualTo(item.quantity),
          );
          const updated = await tx.purchaseOrder.update({
            where: { id },
            data: { status: complete ? 'RECIBIDA' : 'PARCIAL' },
            include: purchaseOrderInclude,
          });
          return {
            order: updated,
            received: lines.map(({ item, quantity }) => ({
              itemId: item.id,
              productId: item.productId,
              quantity,
            })),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      await this.audit.log({
        userId: actingUserId,
        entity: 'PurchaseOrder',
        entityId: id,
        action: 'RECEIVE',
        after: { status: order.status, receivedAt, lines: received },
      });

      return withSummary(order);
    } catch (error) {
      if (isSerializationFailure(error)) {
        throw new ConflictException(
          'Otra recepción de esta compra se registró al mismo tiempo, intenta de nuevo',
        );
      }
      throw error;
    }
  }

  // El proveedor no va a mandar el resto: la compra se da por terminada con
  // lo que llegó, y su total pasa a ser el valor recibido (lo que de verdad
  // se le va a pagar).
  async close(id: string, actingUserId: string) {
    const order = await this.prisma.$transaction(
      async (tx: TransactionClient) => {
        const current = await tx.purchaseOrder.findUnique({
          where: { id },
          include: { items: true },
        });
        if (!current) {
          throw new NotFoundException('Compra no encontrada');
        }
        if (current.status !== 'PARCIAL') {
          throw new BadRequestException(
            'Solo se puede cerrar una compra que llegó a medias',
          );
        }
        const receivedValue = receivedValueOf(current.items);
        if (current.amountPaid.greaterThan(receivedValue)) {
          throw new BadRequestException(
            `Lo pagado (${formatMoney(current.amountPaid)}) supera lo recibido (${formatMoney(receivedValue)}): anula primero el pago de más`,
          );
        }
        const result = await tx.purchaseOrder.updateMany({
          where: { id, status: 'PARCIAL' },
          data: {
            status: 'CERRADA',
            closedAt: new Date(),
            total: receivedValue,
          },
        });
        if (result.count === 0) {
          throw new ConflictException('La compra cambió mientras tanto');
        }
        return tx.purchaseOrder.findUniqueOrThrow({
          where: { id },
          include: purchaseOrderInclude,
        });
      },
    );

    await this.audit.log({
      userId: actingUserId,
      entity: 'PurchaseOrder',
      entityId: id,
      action: 'CLOSE',
      after: { status: order.status, total: order.total },
    });

    return withSummary(order);
  }

  // Solo si no llegó nada y no hay pagos vigentes: una compra con stock
  // recibido no se puede deshacer cancelándola (el Kardex no se edita), y
  // un pago vigente quedaría colgando de una compra que no existe.
  async cancel(id: string, actingUserId: string) {
    const current = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { payments: { where: { voidedAt: null } } },
    });
    if (!current) {
      throw new NotFoundException('Compra no encontrada');
    }
    if (current.status !== 'PENDIENTE') {
      throw new BadRequestException(
        current.status === 'CANCELADA'
          ? 'La compra ya está cancelada'
          : 'No se puede cancelar una compra que ya recibió mercancía',
      );
    }
    if (current.payments.length > 0) {
      throw new BadRequestException(
        'La compra tiene pagos vigentes: anúlalos antes de cancelarla',
      );
    }

    const result = await this.prisma.purchaseOrder.updateMany({
      where: { id, status: 'PENDIENTE' },
      data: { status: 'CANCELADA', cancelledAt: new Date() },
    });
    if (result.count === 0) {
      throw new ConflictException('La compra cambió mientras tanto');
    }
    const order = await this.prisma.purchaseOrder.findUniqueOrThrow({
      where: { id },
      include: purchaseOrderInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'PurchaseOrder',
      entityId: id,
      action: 'CANCEL',
      before: { status: 'PENDIENTE' },
      after: { status: 'CANCELADA' },
    });

    return withSummary(order);
  }

  // Mismo diseño que RemissionsService.addPayment: el saldo se lee y se
  // actualiza en una transacción Serializable. Se puede pagar por
  // adelantado (antes de recibir), nunca más que el total de la compra.
  async addPayment(id: string, dto: CreatePaymentDto, actingUserId: string) {
    try {
      const { order, payment } = await this.prisma.$transaction(
        async (tx: TransactionClient) => {
          const current = await tx.purchaseOrder.findUnique({ where: { id } });
          if (!current) {
            throw new NotFoundException('Compra no encontrada');
          }
          if (current.status === 'CANCELADA') {
            throw new BadRequestException(
              'No se pueden registrar pagos en una compra cancelada',
            );
          }
          if (!current.tracksPayment) {
            throw new BadRequestException(
              'Es una compra histórica, de antes de que Opera llevara los pagos',
            );
          }
          const pending = current.total.minus(current.amountPaid);
          if (pending.lessThan(dto.amount)) {
            throw new BadRequestException(
              pending.lessThanOrEqualTo(0)
                ? 'Esta compra ya está pagada por completo'
                : `El pago (${formatMoney(new Decimal(dto.amount))}) supera el saldo de la compra (${formatMoney(pending)})`,
            );
          }

          const created = await tx.supplierPayment.create({
            data: {
              purchaseOrderId: id,
              amount: dto.amount,
              method: dto.method,
              paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
              note: dto.note?.trim() || undefined,
              userId: actingUserId,
            },
          });
          const updated = await tx.purchaseOrder.update({
            where: { id },
            data: { amountPaid: current.amountPaid.plus(dto.amount) },
            include: purchaseOrderInclude,
          });
          return { order: updated, payment: created };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      await this.audit.log({
        userId: actingUserId,
        entity: 'PurchaseOrder',
        entityId: id,
        action: 'ADD_PAYMENT',
        after: {
          paymentId: payment.id,
          amount: payment.amount,
          method: payment.method,
          paidAt: payment.paidAt,
          amountPaid: order.amountPaid,
        },
      });

      return withSummary(order);
    } catch (error) {
      if (isSerializationFailure(error)) {
        throw new ConflictException(
          'Otro pago se registró al mismo tiempo, intenta de nuevo',
        );
      }
      throw error;
    }
  }

  // Igual que en remisiones: el pago anulado queda en el historial con su
  // motivo, y amountPaid se recalcula sumando los vigentes.
  async voidPayment(
    id: string,
    paymentId: string,
    dto: VoidPaymentDto,
    actingUserId: string,
  ) {
    const order = await this.prisma.$transaction(
      async (tx: TransactionClient) => {
        const result = await tx.supplierPayment.updateMany({
          where: { id: paymentId, purchaseOrderId: id, voidedAt: null },
          data: { voidedAt: new Date(), voidReason: dto.reason },
        });
        if (result.count === 0) {
          const exists = await tx.supplierPayment.findFirst({
            where: { id: paymentId, purchaseOrderId: id },
          });
          if (!exists) {
            throw new NotFoundException('Pago no encontrado');
          }
          throw new BadRequestException('El pago ya está anulado');
        }
        const { _sum } = await tx.supplierPayment.aggregate({
          where: { purchaseOrderId: id, voidedAt: null },
          _sum: { amount: true },
        });
        return tx.purchaseOrder.update({
          where: { id },
          data: { amountPaid: _sum.amount ?? new Decimal(0) },
          include: purchaseOrderInclude,
        });
      },
    );

    await this.audit.log({
      userId: actingUserId,
      entity: 'PurchaseOrder',
      entityId: id,
      action: 'VOID_PAYMENT',
      after: {
        paymentId,
        voidReason: dto.reason,
        amountPaid: order.amountPaid,
      },
    });

    return withSummary(order);
  }
}
