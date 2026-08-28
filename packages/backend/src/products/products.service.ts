import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

// Derivado del propio schema de Prisma en vez de repetir a mano la forma de
// category/unit (señalado en la re-auditoría): si el modelo Category o Unit
// gana/pierde un campo, este tipo se actualiza solo — antes podía quedar
// desincronizado en silencio de lo que la base realmente devuelve.
type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

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
