import {
  AlertTriangle,
  ClipboardList,
  Factory,
  History,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import { KPICard } from '../components/ui/KPICard';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { useDashboardSummary } from '../hooks/useDashboardSummary';
import type { DashboardSummary } from '../types/dashboard';

type RecentPurchase = DashboardSummary['recentPurchases'][number];
type RecentSale = DashboardSummary['recentSales'][number];
type ActivityEntry = DashboardSummary['recentActivity'][number];

const orderStatusLabel: Record<RecentSale['status'], string> = {
  PENDIENTE: 'Pendiente',
  EN_PRODUCCION: 'En producción',
  EN_ALMACEN: 'En almacén',
  CANCELADO: 'Cancelado',
};

function formatMoney(value: string): string {
  return Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2 });
}

function formatQuantity(value: string): string {
  return Number(value).toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CO', { dateStyle: 'short' });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

const purchaseColumns: DataTableColumn<RecentPurchase>[] = [
  { key: 'supplier', header: 'Proveedor', render: (row) => row.supplierName },
  { key: 'product', header: 'Producto', render: (row) => row.productName },
  {
    key: 'quantity',
    header: 'Cantidad',
    className: 'text-right tabular-nums',
    render: (row) => formatQuantity(row.quantity),
  },
  {
    key: 'unitCost',
    header: 'Costo unitario',
    className: 'text-right tabular-nums',
    render: (row) => formatMoney(row.unitCost),
  },
  {
    key: 'purchasedAt',
    header: 'Fecha',
    render: (row) => formatDate(row.purchasedAt),
  },
];

const saleColumns: DataTableColumn<RecentSale>[] = [
  { key: 'customer', header: 'Cliente', render: (row) => row.customerName },
  {
    key: 'status',
    header: 'Estado',
    render: (row) => orderStatusLabel[row.status],
  },
  {
    key: 'total',
    header: 'Total',
    className: 'text-right tabular-nums',
    render: (row) => formatMoney(row.total),
  },
  {
    key: 'createdAt',
    header: 'Fecha',
    render: (row) => formatDate(row.createdAt),
  },
];

const activityColumns: DataTableColumn<ActivityEntry>[] = [
  { key: 'entity', header: 'Entidad', render: (row) => row.entity },
  { key: 'action', header: 'Acción', render: (row) => row.action },
  { key: 'user', header: 'Usuario', render: (row) => row.userName },
  {
    key: 'timestamp',
    header: 'Cuándo',
    render: (row) => formatDateTime(row.timestamp),
  },
];

function DashboardPage() {
  const { data, isLoading } = useDashboardSummary();

  const pendingOrders =
    (data?.orders.PENDIENTE ?? 0) + (data?.orders.EN_PRODUCCION ?? 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-ink text-xl font-medium">Dashboard</h1>
        <p className="text-ink-muted mt-1 text-sm">
          Indicadores agregados de inventario, producción, pedidos y compras.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          icon={Wallet}
          label="Valor de inventario"
          value={data ? formatMoney(data.inventory.totalStockValue) : '—'}
        />
        <KPICard
          icon={AlertTriangle}
          label="Productos con stock crítico"
          value={data ? data.inventory.lowStockCount : '—'}
          variant={
            data && data.inventory.lowStockCount > 0 ? 'warning' : 'accent'
          }
        />
        <KPICard
          icon={ShoppingCart}
          label="Pedidos pendientes"
          value={data ? pendingOrders : '—'}
        />
        <KPICard
          icon={Factory}
          label="Producción en proceso"
          value={data ? data.production.EN_PROCESO : '—'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-ink text-lg font-medium">Ventas recientes</h2>
          <DataTable
            columns={saleColumns}
            rows={data?.recentSales ?? []}
            rowKey={(row) => row.id}
            isLoading={isLoading}
            emptyMessage="Todavía no hay pedidos registrados."
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-ink text-lg font-medium">Compras recientes</h2>
          <DataTable
            columns={purchaseColumns}
            rows={data?.recentPurchases ?? []}
            rowKey={(row) => row.id}
            isLoading={isLoading}
            emptyMessage="Todavía no hay compras registradas."
          />
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <History className="text-ink-muted h-5 w-5" />
          <h2 className="text-ink text-lg font-medium">Actividad reciente</h2>
        </div>
        <DataTable
          columns={activityColumns}
          rows={data?.recentActivity ?? []}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="Sin actividad registrada todavía."
        />
      </section>

      {data && data.inventory.lowStockProducts.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="text-ink-muted h-5 w-5" />
            <h2 className="text-ink text-lg font-medium">
              Productos con stock crítico
            </h2>
          </div>
          <ul className="flex flex-col gap-2">
            {data.inventory.lowStockProducts.map((product) => (
              <li
                key={product.id}
                className="border-line bg-surface-raised flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <span className="text-ink">
                  {product.sku} — {product.name}
                </span>
                <span className="text-ink-muted">
                  {formatQuantity(product.currentStock)} / mín.{' '}
                  {product.minStock ? formatQuantity(product.minStock) : '—'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default DashboardPage;
