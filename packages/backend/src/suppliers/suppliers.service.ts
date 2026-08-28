import { Injectable } from '@nestjs/common';
import { Supplier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  asCatalogDelegate,
  CatalogService,
} from '../common/catalog/catalog.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

const sortableFields = ['name', 'createdAt'] as const;

@Injectable()
export class SuppliersService extends CatalogService<
  Supplier,
  CreateSupplierDto,
  UpdateSupplierDto
> {
  constructor(prisma: PrismaService, audit: AuditService) {
    super(asCatalogDelegate<Supplier>(prisma.supplier), audit, {
      entityName: 'Supplier',
      notFoundMessage: 'Proveedor no encontrado',
      searchFields: ['name'],
      sortableFields,
      defaultSortField: 'name',
    });
  }
}
