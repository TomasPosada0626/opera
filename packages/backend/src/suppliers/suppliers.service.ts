import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

const sortableFields = ['name', 'createdAt'] as const;

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateSupplierDto, actingUserId: string) {
    const supplier = await this.prisma.supplier.create({ data: dto });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Supplier',
      entityId: supplier.id,
      action: 'CREATE',
      after: supplier,
    });

    return supplier;
  }

  findAll(query: ListQueryDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'asc',
      search,
    } = query;
    const where: Prisma.SupplierWhereInput = search
      ? { name: { contains: search, mode: 'insensitive' } }
      : {};
    const orderBy = resolveOrderBy(sortBy, sortOrder, sortableFields, 'name');

    return paginate(
      () => this.prisma.supplier.count({ where }),
      ({ skip, take }) =>
        this.prisma.supplier.findMany({ where, orderBy, skip, take }),
      page,
      pageSize,
    );
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto, actingUserId: string) {
    const before = await this.findOne(id);
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Supplier',
      entityId: supplier.id,
      action: 'UPDATE',
      before,
      after: supplier,
    });

    return supplier;
  }

  async deactivate(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Supplier',
      entityId: supplier.id,
      action: 'DEACTIVATE',
      before,
      after: supplier,
    });

    return supplier;
  }
}
