import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateSupplierProductDto } from './dto/create-supplier-product.dto';
import { ListSupplierProductsDto } from './dto/list-supplier-products.dto';

const supplierProductInclude = { supplier: true, product: true };
const sortableFields = ['createdAt', 'price'] as const;

@Injectable()
export class SupplierProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Lista de precios de referencia, no versionada — registrar un precio para
  // un par proveedor/producto que ya existía lo sobreescribe (upsert sobre
  // @@unique([supplierId, productId])) en vez de crear una fila duplicada.
  async create(dto: CreateSupplierProductDto, actingUserId: string) {
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

    const existing = await this.prisma.supplierProduct.findUnique({
      where: {
        supplierId_productId: {
          supplierId: dto.supplierId,
          productId: dto.productId,
        },
      },
    });

    const supplierProduct = await this.prisma.supplierProduct.upsert({
      where: {
        supplierId_productId: {
          supplierId: dto.supplierId,
          productId: dto.productId,
        },
      },
      create: {
        supplierId: dto.supplierId,
        productId: dto.productId,
        price: dto.price,
      },
      update: { price: dto.price },
      include: supplierProductInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'SupplierProduct',
      entityId: supplierProduct.id,
      action: existing ? 'UPDATE' : 'CREATE',
      before: existing ?? undefined,
      after: supplierProduct,
    });

    return supplierProduct;
  }

  findAll(query: ListSupplierProductsDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'desc',
      supplierId,
      productId,
    } = query;
    const where: Prisma.SupplierProductWhereInput = {
      ...(supplierId ? { supplierId } : {}),
      ...(productId ? { productId } : {}),
    };
    const orderBy = resolveOrderBy(
      sortBy,
      sortOrder,
      sortableFields,
      'createdAt',
    );

    return paginate(
      () => this.prisma.supplierProduct.count({ where }),
      ({ skip, take }) =>
        this.prisma.supplierProduct.findMany({
          where,
          include: supplierProductInclude,
          orderBy,
          skip,
          take,
        }),
      page,
      pageSize,
    );
  }
}
