import { BadRequestException, Injectable } from '@nestjs/common';
import { Unit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  asCatalogDelegate,
  CatalogService,
} from '../common/catalog/catalog.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

const sortableFields = ['name', 'createdAt'] as const;

@Injectable()
export class UnitsService extends CatalogService<
  Unit,
  CreateUnitDto,
  UpdateUnitDto
> {
  constructor(
    private readonly prisma: PrismaService,
    audit: AuditService,
  ) {
    super(asCatalogDelegate<Unit>(prisma.unit), audit, {
      entityName: 'Unit',
      notFoundMessage: 'Unidad no encontrada',
      searchFields: ['name'],
      sortableFields,
      defaultSortField: 'name',
    });
  }

  // Mismo motivo que CategoriesService.deactivate — ver ese comentario.
  override async deactivate(id: string, actingUserId: string) {
    const activeProducts = await this.prisma.product.count({
      where: { unitId: id, isActive: true },
    });
    if (activeProducts > 0) {
      throw new BadRequestException(
        `No se puede desactivar: ${activeProducts} producto(s) activo(s) siguen usando esta unidad`,
      );
    }
    return super.deactivate(id, actingUserId);
  }
}
