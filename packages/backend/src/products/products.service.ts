import { Injectable } from '@nestjs/common';
import { Product } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  asCatalogDelegate,
  CatalogService,
} from '../common/catalog/catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const productInclude = { category: true, unit: true };
const sortableFields = ['name', 'sku', 'createdAt'] as const;

type ProductWithRelations = Product & {
  category: { id: string; name: string };
  unit: { id: string; name: string; abbreviation: string };
};

@Injectable()
export class ProductsService extends CatalogService<
  ProductWithRelations,
  CreateProductDto,
  UpdateProductDto
> {
  constructor(prisma: PrismaService, audit: AuditService) {
    super(asCatalogDelegate<ProductWithRelations>(prisma.product), audit, {
      entityName: 'Product',
      notFoundMessage: 'Producto no encontrado',
      searchFields: ['name', 'sku', 'finish', 'material', 'size'],
      sortableFields,
      defaultSortField: 'name',
      include: productInclude,
    });
  }
}
