import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateRemissionDto } from './dto/create-remission.dto';

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

@Injectable()
export class RemissionsService {
  constructor(
    private readonly prisma: PrismaService,
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

  // Crear una remisión ES el hecho de despachar (ver schema.prisma) — lo
  // único que hay que proteger es que la suma de lo remisionado por línea
  // de pedido no exceda lo pedido, incluso con dos remisiones concurrentes
  // del mismo pedido (dos personas despachando la misma línea a la vez).
  // Serializable + P2034/P2028 tratados igual, mismo patrón que
  // OrdersService.create() (#51) y ProductionOrdersService.complete() (#33).
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

          return tx.remission.create({
            data: {
              orderId: dto.orderId,
              userId: actingUserId,
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
