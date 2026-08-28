import { Injectable } from '@nestjs/common';
import { Warehouse } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  asCatalogDelegate,
  CatalogService,
} from '../common/catalog/catalog.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

const sortableFields = ['name', 'createdAt'] as const;

@Injectable()
export class WarehousesService extends CatalogService<
  Warehouse,
  CreateWarehouseDto,
  UpdateWarehouseDto
> {
  constructor(prisma: PrismaService, audit: AuditService) {
    super(asCatalogDelegate<Warehouse>(prisma.warehouse), audit, {
      entityName: 'Warehouse',
      notFoundMessage: 'Bodega no encontrada',
      searchFields: ['name'],
      sortableFields,
      defaultSortField: 'name',
    });
  }
}
