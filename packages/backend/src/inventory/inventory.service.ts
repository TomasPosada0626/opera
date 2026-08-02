import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEntryDto } from './dto/create-entry.dto';
import { CreateExitDto } from './dto/create-exit.dto';

type TransactionClient = Prisma.TransactionClient;

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
  // en todas las bodegas (stock global del producto). Acepta un cliente de
  // transacción para que createExit pueda leer el stock dentro del mismo
  // $transaction que valida y escribe — si no, la lectura vería un snapshot
  // separado y la validación de "stock suficiente" no protegería nada.
  async getStock(
    productId: string,
    warehouseId?: string,
    client: TransactionClient | PrismaService = this.prisma,
  ): Promise<Prisma.Decimal> {
    const result = await client.stockMovement.aggregate({
      where: { productId, ...(warehouseId ? { warehouseId } : {}) },
      _sum: { quantity: true },
    });

    return result._sum.quantity ?? new Prisma.Decimal(0);
  }

  // SALIDA resta stock, y a diferencia de ENTRADA necesita decidir ANTES de
  // escribir (¿hay suficiente disponible?) — eso abre una ventana de condición
  // de carrera entre leer el stock y crear el movimiento si dos requests
  // concurrentes leen el mismo stock antes de que cualquiera escriba (ver ADR
  // 0001 y #25). $transaction con nivel Serializable hace que Postgres aborte
  // una de las dos transacciones en conflicto en vez de dejar pasar ambas.
  async createExit(dto: CreateExitDto, userId: string) {
    await Promise.all([
      this.assertProductExists(dto.productId),
      this.assertWarehouseExists(dto.warehouseId),
    ]);

    try {
      return await this.prisma.$transaction(
        async (tx: TransactionClient) => {
          const currentStock = await this.getStock(
            dto.productId,
            dto.warehouseId,
            tx,
          );
          if (currentStock.lessThan(dto.quantity)) {
            throw new BadRequestException(
              `Stock insuficiente: disponible ${currentStock.toString()}, solicitado ${dto.quantity}`,
            );
          }

          return tx.stockMovement.create({
            data: {
              productId: dto.productId,
              warehouseId: dto.warehouseId,
              type: 'SALIDA',
              quantity: -dto.quantity,
              reason: dto.reason,
              location: dto.location,
              userId,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      // P2034: Postgres abortó la transacción por conflicto de serialización
      // (dos SALIDA concurrentes leyeron el mismo stock). No es un bug —
      // es exactamente la protección que se buscaba; el cliente debe reintentar.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Conflicto al registrar la salida, intenta de nuevo',
        );
      }
      throw error;
    }
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
