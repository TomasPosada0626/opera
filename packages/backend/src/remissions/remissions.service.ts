import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateRemissionDto } from './dto/create-remission.dto';
import { UpdateRemissionPaymentDto } from './dto/update-remission-payment.dto';

type TransactionClient = Prisma.TransactionClient;
const remissionInclude = {
  order: { include: { customer: true, warehouse: true } },
  user: { select: { id: true, name: true } },
  items: { include: { orderItem: { include: { product: true } } } },
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

@Injectable()
export class RemissionsService {
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
      () => this.prisma.remission.count(),
      ({ skip, take }) =>
        this.prisma.remission.findMany({
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
  // ProductionOrdersService.complete() (#33).
  async create(dto: CreateRemissionDto, actingUserId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { items: { include: { product: true } } },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }

    const orderItemById = new Map(order.items.map((item) => [item.id, item]));
    for (const item of dto.items) {
      if (!orderItemById.has(item.orderItemId)) {
        throw new NotFoundException(
          `Línea de pedido ${item.orderItemId} no encontrada en este pedido`,
        );
      }
    }

    try {
      const remission = await this.prisma.$transaction(
        async (tx: TransactionClient) => {
          const overages: Overage[] = [];
          for (const item of dto.items) {
            const orderItem = orderItemById.get(item.orderItemId)!;
            const delivered = await tx.remissionItem.aggregate({
              where: { orderItemId: item.orderItemId },
              _sum: { quantity: true },
            });
            const alreadyDelivered =
              delivered._sum.quantity ?? new Prisma.Decimal(0);
            const remaining = orderItem.quantity.minus(alreadyDelivered);
            if (new Prisma.Decimal(item.quantity).greaterThan(remaining)) {
              overages.push({
                orderItemId: item.orderItemId,
                productName: orderItem.product.name,
                requested: String(item.quantity),
                remaining: remaining.toString(),
              });
            }
          }
          if (overages.length > 0) {
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
            throw new BadRequestException({
              message: 'Stock insuficiente para despachar esta remisión',
              shortages,
            });
          }

          for (const [productId, quantity] of quantityByProduct) {
            await tx.stockMovement.create({
              data: {
                productId,
                warehouseId: order.warehouseId,
                type: 'SALIDA',
                quantity: quantity.negated(),
                reason: `Despacho, remisión del pedido ${order.id}`,
                userId: actingUserId,
              },
            });
          }

          return tx.remission.create({
            data: {
              orderId: dto.orderId,
              userId: actingUserId,
              paymentStatus: dto.paymentStatus,
              amountPaid: dto.amountPaid,
              items: {
                create: dto.items.map((item) => ({
                  orderItemId: item.orderItemId,
                  quantity: item.quantity,
                })),
              },
            },
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

  // El pago normalmente se confirma después del despacho, no al momento de
  // crear la remisión — por eso es editable aparte. Sin protección de
  // concurrencia especial: es una actualización de campos simples, sin
  // lectura-decisión-escritura de por medio, así que no hay ventana de
  // carrera que proteger (a diferencia de create()).
  async updatePayment(
    id: string,
    dto: UpdateRemissionPaymentDto,
    actingUserId: string,
  ) {
    const before = await this.findOne(id);

    const updated = await this.prisma.remission.update({
      where: { id },
      data: {
        paymentStatus: dto.paymentStatus,
        amountPaid: dto.amountPaid,
      },
      include: remissionInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Remission',
      entityId: updated.id,
      action: 'UPDATE_PAYMENT',
      before: {
        paymentStatus: before.paymentStatus,
        amountPaid: before.amountPaid,
      },
      after: {
        paymentStatus: updated.paymentStatus,
        amountPaid: updated.amountPaid,
      },
    });

    return updated;
  }

  // pdfkit arma el PDF como un stream de chunks en vez de un archivo en
  // disco — no hay nada que limpiar después ni una carpeta de "remisiones
  // temporales" que mantener; el PDF se genera al vuelo en cada request.
  // Devuelve el número junto con el buffer para que el controller arme el
  // nombre del archivo sin pedir la remisión una segunda vez.
  async generatePdf(id: string): Promise<{ buffer: Buffer; number: number }> {
    const remission = await this.findOne(id);
    const buffer = await this.renderPdf(remission);

    return { buffer, number: remission.number };
  }

  // No incluye paymentStatus/amountPaid a propósito — es dato interno del
  // negocio, nunca algo que vea el cliente en el documento que se lleva.
  private renderPdf(
    remission: Awaited<ReturnType<RemissionsService['findOne']>>,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'letter' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('Remisión', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10);
      doc.text(`No. ${remission.number}`);
      doc.text(`Fecha: ${remission.createdAt.toLocaleDateString('es-CO')}`);
      doc.text(`Cliente: ${remission.order.customer.name}`);
      doc.text(`Bodega: ${remission.order.warehouse.name}`);
      doc.text(`Entregado por: ${remission.user.name}`);
      doc.moveDown();

      const productX = 50;
      const quantityX = 400;
      doc
        .font('Helvetica-Bold')
        .text('Producto', productX, doc.y, { continued: true })
        .text('Cantidad', quantityX, doc.y);
      doc.font('Helvetica').moveDown(0.5);

      for (const item of remission.items) {
        const { product } = item.orderItem;
        const rowY = doc.y;
        doc.text(`${product.sku} — ${product.name}`, productX, rowY, {
          width: quantityX - productX - 10,
        });
        doc.text(item.quantity.toString(), quantityX, rowY);
      }

      doc.end();
    });
  }
}
