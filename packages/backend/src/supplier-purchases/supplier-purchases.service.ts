import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateSupplierPurchaseDto } from './dto/create-supplier-purchase.dto';
import { ListSupplierPurchasesDto } from './dto/list-supplier-purchases.dto';

const supplierPurchaseInclude = {
  supplier: true,
  product: true,
  warehouse: true,
  user: { select: { id: true, name: true } },
};
const sortableFields = ['purchasedAt', 'createdAt'] as const;
type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class SupplierPurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Bitácora manual de compras — registrar una entrada no toca stock (ver
  // schema.prisma): la entrada real de materia prima al almacén sigue
  // siendo un movimiento manual de Inventario aparte, decisión del negocio.
  // Sin transacción Serializable: es un solo insert sin lectura-decisión de
  // por medio, no hay ventana de carrera que proteger (mismo espíritu que
  // RemissionsService.updatePayment()).
  async create(dto: CreateSupplierPurchaseDto, actingUserId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado');
    }
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Bodega no encontrada');
    }

    const purchase = await this.prisma.supplierPurchase.create({
      data: {
        supplierId: dto.supplierId,
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : undefined,
        userId: actingUserId,
      },
      include: supplierPurchaseInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'SupplierPurchase',
      entityId: purchase.id,
      action: 'CREATE',
      after: purchase,
    });

    return purchase;
  }

  // Cierra el gap documentado entre "lo pedido a un proveedor" y "lo que de
  // verdad entró al almacén" (#104-purchases) — sin volver la bitácora de
  // compras obligatoria para cada entrada de Inventario, que sigue
  // pudiendo hacerse suelta cuando no hay una compra formal detrás.
  // Recibe siempre la cantidad completa registrada, no parcial — soportar
  // recepciones parciales necesitaría rastrear "cuánto de esta compra ya
  // entró" aparte, complejidad real que hoy nadie pidió.
  //
  // Guard atómico (updateMany con receivedAt: null en el where) para que
  // dos clics/requests concurrentes no generen dos ENTRADAs de la misma
  // compra — mismo patrón que OrdersService.markProduction. Sin
  // Serializable: escribir una ENTRADA nunca falla por sobregiro (a
  // diferencia de una SALIDA), así que no hay una decisión de stock que
  // proteger, solo el guard de "no recibir dos veces".
  async receive(id: string, actingUserId: string) {
    const purchase = await this.prisma.supplierPurchase.findUnique({
      where: { id },
    });
    if (!purchase) {
      throw new NotFoundException('Compra no encontrada');
    }
    if (!purchase.warehouseId) {
      throw new ConflictException(
        'Esta compra no tiene bodega registrada y no se puede recibir',
      );
    }

    const received = await this.prisma.$transaction(
      async (tx: TransactionClient) => {
        const result = await tx.supplierPurchase.updateMany({
          where: { id, receivedAt: null },
          data: { receivedAt: new Date() },
        });
        if (result.count === 0) {
          throw new ConflictException('Esta compra ya fue recibida');
        }

        const movement = await tx.stockMovement.create({
          data: {
            productId: purchase.productId,
            warehouseId: purchase.warehouseId!,
            type: 'ENTRADA',
            quantity: purchase.quantity,
            unitCost: purchase.unitCost,
            reason: `Recepción de compra a proveedor (${purchase.id})`,
            userId: actingUserId,
          },
        });

        return tx.supplierPurchase.update({
          where: { id },
          data: { stockMovementId: movement.id },
          include: supplierPurchaseInclude,
        });
      },
    );

    await this.audit.log({
      userId: actingUserId,
      entity: 'SupplierPurchase',
      entityId: received.id,
      action: 'RECEIVE',
      before: { receivedAt: null },
      after: { receivedAt: received.receivedAt },
    });

    return received;
  }

  findAll(query: ListSupplierPurchasesDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'desc',
      supplierId,
      productId,
      from,
      to,
    } = query;
    const where: Prisma.SupplierPurchaseWhereInput = {
      ...(supplierId ? { supplierId } : {}),
      ...(productId ? { productId } : {}),
      ...(from || to
        ? {
            purchasedAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lt: new Date(to) } : {}),
            },
          }
        : {}),
    };
    const orderBy = resolveOrderBy(
      sortBy,
      sortOrder,
      sortableFields,
      'purchasedAt',
    );

    return paginate(
      () => this.prisma.supplierPurchase.count({ where }),
      ({ skip, take }) =>
        this.prisma.supplierPurchase.findMany({
          where,
          include: supplierPurchaseInclude,
          orderBy,
          skip,
          take,
        }),
      page,
      pageSize,
    );
  }
}
