import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const sortableFields = ['name', 'createdAt'] as const;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateCategoryDto, actingUserId: string) {
    const category = await this.prisma.category.create({ data: dto });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Category',
      entityId: category.id,
      action: 'CREATE',
      after: category,
    });

    return category;
  }

  findAll(query: ListQueryDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'asc',
      search,
    } = query;
    const where: Prisma.CategoryWhereInput = search
      ? { name: { contains: search, mode: 'insensitive' } }
      : {};
    const orderBy = resolveOrderBy(sortBy, sortOrder, sortableFields, 'name');

    return paginate(
      () => this.prisma.category.count({ where }),
      ({ skip, take }) =>
        this.prisma.category.findMany({ where, orderBy, skip, take }),
      page,
      pageSize,
    );
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, actingUserId: string) {
    const before = await this.findOne(id);
    const category = await this.prisma.category.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Category',
      entityId: category.id,
      action: 'UPDATE',
      before,
      after: category,
    });

    return category;
  }

  async deactivate(id: string, actingUserId: string) {
    const before = await this.findOne(id);
    const category = await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.log({
      userId: actingUserId,
      entity: 'Category',
      entityId: category.id,
      action: 'DEACTIVATE',
      before,
      after: category,
    });

    return category;
  }
}
