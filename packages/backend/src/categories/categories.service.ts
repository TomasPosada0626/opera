import { BadRequestException, Injectable } from '@nestjs/common';
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
  constructor(
    private readonly prisma: PrismaService,
    audit: AuditService,
  ) {
    super(asCatalogDelegate<Category>(prisma.category), audit, {
      entityName: 'Category',
      notFoundMessage: 'Categoría no encontrada',
      searchFields: ['name'],
      sortableFields,
      defaultSortField: 'name',
    });
  }

  // Antes el flag isActive era cosmético fuera del propio findAll — se
  // podía desactivar una categoría con productos activos sin ningún aviso
  // (señalado en la re-auditoría). Bloquear, no solo advertir, porque el
  // proyecto trata la corrección como estructural (ver PRODUCT.md): hacer
  // la acción incorrecta imposible, no solo desalentarla.
  override async deactivate(id: string, actingUserId: string) {
    const activeProducts = await this.prisma.product.count({
      where: { categoryId: id, isActive: true },
    });
    if (activeProducts > 0) {
      throw new BadRequestException(
        `No se puede desactivar: ${activeProducts} producto(s) activo(s) siguen usando esta categoría`,
      );
    }
    return super.deactivate(id, actingUserId);
  }
}
