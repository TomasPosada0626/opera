import { Injectable } from '@nestjs/common';
import { Category } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  asCatalogDelegate,
  CatalogService,
} from '../common/catalog/catalog.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const sortableFields = ['name', 'createdAt'] as const;

@Injectable()
export class CategoriesService extends CatalogService<
  Category,
  CreateCategoryDto,
  UpdateCategoryDto
> {
  constructor(prisma: PrismaService, audit: AuditService) {
    super(asCatalogDelegate<Category>(prisma.category), audit, {
      entityName: 'Category',
      notFoundMessage: 'Categoría no encontrada',
      searchFields: ['name'],
      sortableFields,
      defaultSortField: 'name',
    });
  }
}
