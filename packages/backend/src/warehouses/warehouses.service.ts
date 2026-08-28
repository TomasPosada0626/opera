import { BadRequestException, Injectable } from '@nestjs/common';
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
  constructor(
    private readonly prisma: PrismaService,
    audit: AuditService,
  ) {
    super(asCatalogDelegate<Warehouse>(prisma.warehouse), audit, {
      entityName: 'Warehouse',
      notFoundMessage: 'Bodega no encontrada',
      searchFields: ['name'],
      sortableFields,
      defaultSortField: 'name',
    });
  }

  // Warehouse es FK de casi todo el sistema transaccional — el chequeo acá
  // no es "¿algo la referencia?" (eso sería casi siempre cierto, hasta
  // para una bodega histórica ya vacía) sino "¿todavía tiene stock real
  // adentro?", que es lo que de verdad importaría perder de vista si se
  // desactiva por error (señalado en la re-auditoría). `having` empuja el
  // filtro "suma != 0" a Postgres — no trae todos los productos a memoria
  // para descartarlos acá.
  override async deactivate(id: string, actingUserId: string) {
    const withStock = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { warehouseId: id },
      _sum: { quantity: true },
      having: { quantity: { _sum: { not: 0 } } },
      orderBy: { productId: 'asc' },
      take: 1,
    });
    if (withStock.length > 0) {
      throw new BadRequestException(
        'No se puede desactivar: la bodega todavía tiene stock real',
      );
    }
    return super.deactivate(id, actingUserId);
  }
}
