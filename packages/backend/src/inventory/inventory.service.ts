import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
