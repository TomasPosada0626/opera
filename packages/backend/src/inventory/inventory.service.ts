import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, resolveOrderBy } from '../common/pagination/paginate';
import { CreateEntryDto } from './dto/create-entry.dto';
import { CreateExitDto } from './dto/create-exit.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { KardexQueryDto } from './dto/kardex-query.dto';

type TransactionClient = Prisma.TransactionClient;
const kardexSortableFields = ['createdAt'] as const;

interface MovementRefs {
  productId: string;
  warehouseId: string;
  reason?: string;
  location?: string;
}

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

  // SALIDA y AJUSTE (a diferencia de ENTRADA) pueden reducir el stock, y
  // necesitan decidir ANTES de escribir (¿el resultado se queda en 0 o más?)
  // — eso abre una ventana de condición de carrera entre leer el stock y
  // crear el movimiento si dos requests concurrentes leen el mismo stock
  // antes de que cualquiera escriba (ver ADR 0001 y #25). $transaction con
  // nivel Serializable hace que Postgres aborte una de las dos transacciones
  // en conflicto en vez de dejar pasar un sobregiro.
  private async createMovementWithStockCheck(
    type: 'SALIDA' | 'AJUSTE',
    refs: MovementRefs,
    delta: number,
    userId: string,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx: TransactionClient) => {
          const currentStock = await this.getStock(
            refs.productId,
            refs.warehouseId,
            tx,
          );
          const resultingStock = currentStock.plus(delta);
          if (resultingStock.lessThan(0)) {
            throw new BadRequestException(
              `Stock insuficiente: disponible ${currentStock.toString()}, quedaría en ${resultingStock.toString()}`,
            );
          }

          return tx.stockMovement.create({
            data: {
              productId: refs.productId,
              warehouseId: refs.warehouseId,
              type,
              quantity: delta,
              reason: refs.reason,
              location: refs.location,
              userId,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      // P2034: Postgres abortó la transacción por conflicto de serialización
      // (dos movimientos concurrentes leyeron el mismo stock). No es un bug —
      // es exactamente la protección que se buscaba; el cliente debe reintentar.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          `Conflicto al registrar el movimiento, intenta de nuevo`,
        );
      }
      throw error;
    }
  }

  async createExit(dto: CreateExitDto, userId: string) {
    await Promise.all([
      this.assertProductExists(dto.productId),
      this.assertWarehouseExists(dto.warehouseId),
    ]);

    return this.createMovementWithStockCheck(
      'SALIDA',
      dto,
      -dto.quantity,
      userId,
    );
  }

  async createAdjustment(dto: CreateAdjustmentDto, userId: string) {
    await Promise.all([
      this.assertProductExists(dto.productId),
      this.assertWarehouseExists(dto.warehouseId),
    ]);

    return this.createMovementWithStockCheck(
      'AJUSTE',
      dto,
      dto.quantity,
      userId,
    );
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

  // Reporte, no un listado paginable: el umbral compara stock calculado
  // (agregado de StockMovement) contra minStock, algo que Prisma no puede
  // expresar en un WHERE — se filtra en memoria sobre el conjunto (ya acotado
  // a productos con umbral configurado) de candidatos.
  async getLowStockProducts() {
    const candidates = await this.prisma.product.findMany({
      where: { isActive: true, minStock: { not: null } },
      include: { category: true, unit: true },
    });
    if (candidates.length === 0) {
      return [];
    }

    const grouped = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { productId: { in: candidates.map((product) => product.id) } },
      _sum: { quantity: true },
    });
    const stockByProduct = new Map(
      grouped.map(({ productId, _sum }) => [
        productId,
        _sum.quantity ?? new Prisma.Decimal(0),
      ]),
    );

    return candidates
      .map((product) => ({
        ...product,
        currentStock: stockByProduct.get(product.id) ?? new Prisma.Decimal(0),
      }))
      .filter(
        (product) =>
          product.minStock !== null &&
          product.currentStock.lessThan(product.minStock),
      );
  }

  // Historial paginado, más reciente primero por defecto (ver KardexQueryDto).
  getKardex(productId: string, query: KardexQueryDto) {
    const {
      page = 1,
      pageSize = 20,
      sortBy,
      sortOrder = 'desc',
      warehouseId,
    } = query;
    const where: Prisma.StockMovementWhereInput = {
      productId,
      ...(warehouseId ? { warehouseId } : {}),
    };
    const orderBy = resolveOrderBy(
      sortBy,
      sortOrder,
      kardexSortableFields,
      'createdAt',
    );

    return paginate(
      () => this.prisma.stockMovement.count({ where }),
      ({ skip, take }) =>
        this.prisma.stockMovement.findMany({
          where,
          include: {
            warehouse: { select: { id: true, name: true } },
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy,
          skip,
          take,
        }),
      page,
      pageSize,
    );
  }
}
