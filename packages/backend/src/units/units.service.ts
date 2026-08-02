import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

const sortableFields = ['name', 'createdAt'] as const;

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUnitDto, actingUserId: string) {
    const unit = await this.prisma.unit.create({ data: dto });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Unit',
      entityId: unit.id,
      action: 'CREATE',
      after: unit,
    });

    return unit;
  }

  findAll(query: ListQueryDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'asc',
      search,
    } = query;
    const where: Prisma.UnitWhereInput = search
      ? { name: { contains: search, mode: 'insensitive' } }
      : {};
    const orderBy = resolveOrderBy(sortBy, sortOrder, sortableFields, 'name');

    return paginate(
      () => this.prisma.unit.count({ where }),
      ({ skip, take }) =>
        this.prisma.unit.findMany({ where, orderBy, skip, take }),
      page,
      pageSize,
    );
  }

  async findOne(id: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    if (!unit) {
      throw new NotFoundException('Unidad no encontrada');
    }

    return unit;
  }

  async update(id: string, dto: UpdateUnitDto, actingUserId: string) {
    const before = await this.findOne(id);
    const unit = await this.prisma.unit.update({ where: { id }, data: dto });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Unit',
      entityId: unit.id,
      action: 'UPDATE',
      before,
      after: unit,
    });

    return unit;
  }

  async deactivate(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    const unit = await this.prisma.unit.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Unit',
      entityId: unit.id,
      action: 'DEACTIVATE',
      before,
      after: unit,
    });

    return unit;
  }
}
