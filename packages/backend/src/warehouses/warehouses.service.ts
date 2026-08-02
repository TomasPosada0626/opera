import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

const sortableFields = ['name', 'createdAt'] as const;

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateWarehouseDto, actingUserId: string) {
    const warehouse = await this.prisma.warehouse.create({ data: dto });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Warehouse',
      entityId: warehouse.id,
      action: 'CREATE',
      after: warehouse,
    });

    return warehouse;
  }

  findAll(query: ListQueryDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'asc',
      search,
    } = query;
    const where: Prisma.WarehouseWhereInput = search
      ? { name: { contains: search, mode: 'insensitive' } }
      : {};
    const orderBy = resolveOrderBy(sortBy, sortOrder, sortableFields, 'name');

    return paginate(
      () => this.prisma.warehouse.count({ where }),
      ({ skip, take }) =>
        this.prisma.warehouse.findMany({ where, orderBy, skip, take }),
      page,
      pageSize,
    );
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException('Bodega no encontrada');
    }

    return warehouse;
  }

  async update(id: string, dto: UpdateWarehouseDto, actingUserId: string) {
    const before = await this.findOne(id);
    const warehouse = await this.prisma.warehouse.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Warehouse',
      entityId: warehouse.id,
      action: 'UPDATE',
      before,
      after: warehouse,
    });

    return warehouse;
  }

  async deactivate(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    const warehouse = await this.prisma.warehouse.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Warehouse',
      entityId: warehouse.id,
      action: 'DEACTIVATE',
      before,
      after: warehouse,
    });

    return warehouse;
  }
}
