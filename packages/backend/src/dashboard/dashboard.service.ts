import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { ReportsService } from '../reports/reports.service';
import { overdueWhere } from '../orders/orders.service';
import { countRecentWarnings } from './recent-warnings.util';

const RECENT_LIMIT = 5;
const RECENT_ACTIVITY_LIMIT = 10;
const OVERDUE_LIMIT = 10;

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
      overdueCount,
      overdueOrders,
      receivables,
      payables,
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
      this.prisma.purchaseOrder.findMany({
        take: RECENT_LIMIT,
        orderBy: { purchasedAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          _count: { select: { items: true } },
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
      this.prisma.order.count({ where: overdueWhere() }),
      this.prisma.order.findMany({
        where: overdueWhere(),
        take: OVERDUE_LIMIT,
        orderBy: { estimatedDeliveryDate: 'asc' },
        include: { customer: { select: { id: true, name: true } } },
      }),
      // Por cobrar = total - abonado de las remisiones vigentes que no están
      // pagadas del todo. Mismo criterio que CustomersService.getBalance,
      // agregado sobre todos los clientes.
      this.prisma.remission.aggregate({
        where: { voidedAt: null, paymentStatus: { not: 'PAGADO' } },
        _sum: { total: true, amountPaid: true },
        _count: true,
      }),
      // Por pagar a proveedores: el mismo cálculo que el reporte de cuentas
      // por pagar, para que los dos números nunca difieran.
      this.reports.getPayablesReport(),
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
      // Los mismos tres valores del enum ProductionOrderStatus — antes
      // listaba un 'EN_PROCESO' que no existe (siempre 0) y omitía
      // CANCELADA (auditoría ronda 6).
      production: statusCounts(productionByStatus, [
        'PENDIENTE',
        'COMPLETADA',
        'CANCELADA',
      ]),
      orders: statusCounts(ordersByStatus, [
        'PENDIENTE',
        'EN_PRODUCCION',
        'EN_ALMACEN',
        'DESPACHADO',
        'CANCELADO',
      ]),
      overdueOrders: {
        count: overdueCount,
        orders: overdueOrders.map((order) => ({
          id: order.id,
          number: order.number,
          customerName: order.customer.name,
          status: order.status,
          estimatedDeliveryDate: order.estimatedDeliveryDate,
        })),
      },
      receivables: {
        total: (receivables._sum.total ?? new Prisma.Decimal(0)).minus(
          receivables._sum.amountPaid ?? new Prisma.Decimal(0),
        ),
        remissionCount: receivables._count,
      },
      payables: {
        total: payables.reduce(
          (sum, row) => sum.plus(row.balance),
          new Prisma.Decimal(0),
        ),
        purchaseOrderCount: payables.reduce(
          (count, row) => count + row.purchaseOrderCount,
          0,
        ),
      },
      recentPurchases: recentPurchases.map((purchase) => ({
        id: purchase.id,
        number: purchase.number,
        supplierName: purchase.supplier.name,
        status: purchase.status,
        itemCount: purchase._count.items,
        total: purchase.total,
        purchasedAt: purchase.purchasedAt,
      })),
      recentSales: recentSales.map((order) => ({
        id: order.id,
        number: order.number,
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
      // Sin Alertmanager para LAN-only (auditoría 2026-08-28) — cuenta
      // warn/error/fatal de logs/opera-backend.log en las últimas 24h, lo
      // mínimo para que "algo anda mal" se note acá en vez de exigir abrir
      // el log a mano.
      recentWarnings: countRecentWarnings(),
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
