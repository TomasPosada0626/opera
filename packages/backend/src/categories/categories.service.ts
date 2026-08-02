import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

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

  findAll() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
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
