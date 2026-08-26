import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { ReportsService } from '../reports/reports.service';

const RECENT_LIMIT = 5;
const RECENT_ACTIVITY_LIMIT = 10;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  // Un solo endpoint agregado para la pantalla de inicio (#75) — cada
  // sección reutiliza la lógica de negocio ya existente en su módulo dueño
  // (inventario, reportes, auditoría) en vez de reimplementarla acá; este
  // service solo arma el resumen y los conteos que no viven en ningún otro
  // lado todavía (producción/pedidos por estado, listados recientes).
  async getSummary() {
    const [
      inventoryReport,
      lowStockProducts,
      productionByStatus,
      ordersByStatus,
      recentPurchases,
      recentSales,
      recentActivity,
    ] = await Promise.all([
      this.reports.getInventoryReport(),
      this.inventory.getLowStockProducts(),
      this.prisma.productionOrder.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.supplierPurchase.findMany({
        take: RECENT_LIMIT,
        orderBy: { purchasedAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          product: { select: { id: true, sku: true, name: true } },
        },
      }),
      this.prisma.order.findMany({
        take: RECENT_LIMIT,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true } },
          items: { select: { quantity: true, unitPrice: true } },
        },
      }),
      this.audit.getRecent(RECENT_ACTIVITY_LIMIT),
    ]);

    return {
      inventory: {
        totalStockValue: inventoryReport.reduce(
          (sum, row) => sum.plus(row.stockValue),
          new Prisma.Decimal(0),
        ),
        lowStockCount: lowStockProducts.length,
        lowStockProducts: lowStockProducts.map((product) => ({
          id: product.id,
          sku: product.sku,
          name: product.name,
          currentStock: product.currentStock,
          minStock: product.minStock,
        })),
      },
      production: statusCounts(productionByStatus, [
        'PENDIENTE',
        'EN_PROCESO',
        'COMPLETADA',
      ]),
      orders: statusCounts(ordersByStatus, [
        'PENDIENTE',
        'EN_PRODUCCION',
        'EN_ALMACEN',
        'CANCELADO',
      ]),
      recentPurchases: recentPurchases.map((purchase) => ({
        id: purchase.id,
        supplierName: purchase.supplier.name,
        productName: purchase.product.name,
        quantity: purchase.quantity,
        unitCost: purchase.unitCost,
        purchasedAt: purchase.purchasedAt,
      })),
      recentSales: recentSales.map((order) => ({
        id: order.id,
        customerName: order.customer.name,
        status: order.status,
        total: order.items.reduce(
          (sum, item) => sum.plus(item.quantity.times(item.unitPrice)),
          new Prisma.Decimal(0),
        ),
        createdAt: order.createdAt,
      })),
      recentActivity: recentActivity.map((entry) => ({
        id: entry.id,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        userName: entry.user.name,
        timestamp: entry.timestamp,
      })),
    };
  }
}

function statusCounts<TStatus extends string>(
  grouped: { status: TStatus; _count: number }[],
  allStatuses: readonly TStatus[],
): Record<TStatus, number> {
  const byStatus = new Map(grouped.map((row) => [row.status, row._count]));
  return Object.fromEntries(
    allStatuses.map((status) => [status, byStatus.get(status) ?? 0]),
  ) as Record<TStatus, number>;
}
