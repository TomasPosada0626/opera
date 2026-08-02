import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const productInclude = { category: true, unit: true };
const sortableFields = ['name', 'sku', 'createdAt'] as const;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateProductDto, actingUserId: string) {
    const product = await this.prisma.product.create({
      data: dto,
      include: productInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Product',
      entityId: product.id,
      action: 'CREATE',
      after: product,
    });

    return product;
  }

  findAll(query: ListQueryDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'asc',
      search,
    } = query;
    const where: Prisma.ProductWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    const orderBy = resolveOrderBy(sortBy, sortOrder, sortableFields, 'name');

    return paginate(
      () => this.prisma.product.count({ where }),
      ({ skip, take }) =>
        this.prisma.product.findMany({
          where,
          include: productInclude,
          orderBy,
          skip,
          take,
        }),
      page,
      pageSize,
    );
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto, actingUserId: string) {
    const before = await this.findOne(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: productInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Product',
      entityId: product.id,
      action: 'UPDATE',
      before,
      after: product,
    });

    return product;
  }

  async deactivate(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
      include: productInclude,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Product',
      entityId: product.id,
      action: 'DEACTIVATE',
      before,
      after: product,
    });

    return product;
  }
}
