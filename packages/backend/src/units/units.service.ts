import { Injectable } from '@nestjs/common';
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
  constructor(prisma: PrismaService, audit: AuditService) {
    super(asCatalogDelegate<Unit>(prisma.unit), audit, {
      entityName: 'Unit',
      notFoundMessage: 'Unidad no encontrada',
      searchFields: ['name'],
      sortableFields,
      defaultSortField: 'name',
    });
  }
}
