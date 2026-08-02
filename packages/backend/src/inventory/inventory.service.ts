import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEntryDto } from './dto/create-entry.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async assertProductExists(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
  }

  async assertWarehouseExists(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true },
    });
    if (!warehouse) {
      throw new NotFoundException('Bodega no encontrada');
    }
  }

  // No escribe en AuditLog: el propio StockMovement (userId + createdAt +
  // type + quantity) ya es el registro de auditoría de este cambio — envolverlo
  // en AuditLog además sería duplicar el mismo historial dos veces.
  async createEntry(dto: CreateEntryDto, userId: string) {
    await Promise.all([
      this.assertProductExists(dto.productId),
      this.assertWarehouseExists(dto.warehouseId),
    ]);

    return this.prisma.stockMovement.create({
      data: {
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        type: 'ENTRADA',
        quantity: dto.quantity,
        reason: dto.reason,
        location: dto.location,
        userId,
      },
    });
  }

  // El stock nunca es un campo leído directamente — siempre la suma de los
  // deltas con signo en StockMovement (ver ADR 0001). Sin warehouseId, suma
  // en todas las bodegas (stock global del producto).
  async getStock(
    productId: string,
    warehouseId?: string,
  ): Promise<Prisma.Decimal> {
    const result = await this.prisma.stockMovement.aggregate({
      where: { productId, ...(warehouseId ? { warehouseId } : {}) },
      _sum: { quantity: true },
    });

    return result._sum.quantity ?? new Prisma.Decimal(0);
  }

  async getStockByWarehouse(productId: string) {
    const grouped = await this.prisma.stockMovement.groupBy({
      by: ['warehouseId'],
      where: { productId },
      _sum: { quantity: true },
    });

    return grouped.map(({ warehouseId, _sum }) => ({
      warehouseId,
      stock: _sum.quantity ?? new Prisma.Decimal(0),
    }));
  }
}
