import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateSupplierPurchaseDto } from './dto/create-supplier-purchase.dto';
import { ListSupplierPurchasesDto } from './dto/list-supplier-purchases.dto';

const supplierPurchaseInclude = {
  supplier: true,
  product: true,
  user: { select: { id: true, name: true } },
};
const sortableFields = ['purchasedAt', 'createdAt'] as const;

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

    const purchase = await this.prisma.supplierPurchase.create({
      data: {
        supplierId: dto.supplierId,
        productId: dto.productId,
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
