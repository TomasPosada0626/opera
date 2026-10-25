import {
  ArrowRight,
  Bell,
  CalendarX2,
  ClipboardList,
  History,
  PackageSearch,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardHeader } from '../components/ui/Card';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { KPICard } from '../components/ui/KPICard';
import { PageHeader } from '../components/ui/PageHeader';
import { OrderStatusBadge } from '../components/orders/OrderBadges';
import { useDashboardSummary } from '../hooks/useDashboardSummary';
import { auditActionLabel, auditEntityLabel } from '../lib/audit-labels';
import {
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatMoney,
  formatMoneyCompact,
  formatQuantity,
} from '../lib/format';
import { deliveryState, ORDER_STATUS_LABEL } from '../lib/order-status';
import type { DashboardSummary } from '../types/dashboard';

type RecentPurchase = DashboardSummary['recentPurchases'][number];
type RecentSale = DashboardSummary['recentSales'][number];

const purchaseColumns: DataTableColumn<RecentPurchase>[] = [
  {
    key: 'supplier',
    header: 'Proveedor',
    render: (row) => <span className="font-medium">{row.supplierName}</span>,
  },
  { key: 'product', header: 'Producto', render: (row) => row.productName },
  {
    key: 'quantity',
    header: 'Cantidad',
    className: 'text-right figures',
    render: (row) => formatQuantity(row.quantity),
  },
  {
    key: 'unitCost',
    header: 'Costo unit.',
    className: 'text-right figures',
    render: (row) => formatMoney(row.unitCost),
  },
  {
    key: 'purchasedAt',
    header: 'Fecha',
    className: 'text-ink-muted',
    render: (row) => formatDate(row.purchasedAt),
  },
];

const saleColumns: DataTableColumn<RecentSale>[] = [
  {
    key: 'customer',
    header: 'Cliente',
    render: (row) => (
      <Link
        to={`/pedidos/${row.id}`}
        className="hover:text-accent font-medium transition-colors"
      >
        <span className="figures text-ink-faint mr-1.5">#{row.number}</span>
        {row.customerName}
      </Link>
    ),
  },
  {
    key: 'status',
    header: 'Estado',
    render: (row) => <OrderStatusBadge status={row.status} />,
  },
  {
    key: 'total',
    header: 'Total',
    className: 'text-right figures',
    render: (row) => formatMoney(row.total),
  },
  {
    key: 'createdAt',
    header: 'Fecha',
    className: 'text-ink-muted',
    render: (row) => formatDate(row.createdAt),
  },
];

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) {
    return 'Buenos días';
  }
  return hour < 19 ? 'Buenas tardes' : 'Buenas noches';
}

// Pedidos en curso por estación, como una barra segmentada: de un vistazo
// se ve dónde se está acumulando el trabajo (si casi todo está "en
// producción", el cuello de botella es el taller).
function PipelineCard({ orders }: { orders: DashboardSummary['orders'] }) {
  const stations = [
    { status: 'PENDIENTE', tone: 'bg-ink-faint' },
    { status: 'EN_PRODUCCION', tone: 'bg-accent' },
    { status: 'EN_ALMACEN', tone: 'bg-warning' },
  ] as const;
  const total = stations.reduce((sum, s) => sum + orders[s.status], 0);

  return (
    <Card className="p-5">
      <CardHeader
        title="Pedidos en curso"
        description={
          total === 1
            ? '1 pedido sin despachar'
            : `${total} pedidos sin despachar`
        }
        action={
          <Link
            to="/pedidos"
            className="text-accent hover:text-accent-hover inline-flex items-center gap-1 text-[13px] font-medium transition-colors"
          >
            Ver pedidos
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <div className="bg-chrome-strong flex h-2.5 overflow-hidden rounded-full">
        {total > 0 &&
          stations.map(
            (station) =>
              orders[station.status] > 0 && (
                <div
                  key={station.status}
                  className={`${station.tone} h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full`}
                  style={{
                    width: `${(orders[station.status] / total) * 100}%`,
                  }}
                />
              ),
          )}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-4">
        {stations.map((station) => (
          <div key={station.status} className="flex flex-col gap-1">
            <dt className="text-ink-muted inline-flex items-center gap-1.5 text-xs">
              <span className={`h-2 w-2 rounded-full ${station.tone}`} />
              {ORDER_STATUS_LABEL[station.status]}
            </dt>
            <dd className="figures text-ink text-xl font-semibold">
              {orders[station.status]}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function DashboardPage() {
  const { data, isLoading } = useDashboardSummary();
  const now = new Date();
  const inProgress = data
    ? data.orders.PENDIENTE + data.orders.EN_PRODUCCION + data.orders.EN_ALMACEN
    : 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={now.toLocaleDateString('es-CO', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        title={greeting(now)}
        description="Lo que necesita atención hoy: cobros pendientes, pedidos atrasados y stock por debajo del mínimo."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          icon={Wallet}
          label="Por cobrar"
          value={data ? formatMoneyCompact(data.receivables.total) : '—'}
          title={data ? formatMoney(data.receivables.total) : undefined}
          hint={
            data
              ? data.receivables.remissionCount === 1
                ? '1 remisión pendiente'
                : `${data.receivables.remissionCount} remisiones pendientes`
              : undefined
          }
          variant={
            data && Number(data.receivables.total) > 0 ? 'danger' : 'success'
          }
          to="/reportes?vista=cartera"
        />
        <KPICard
          icon={CalendarX2}
          label="Pedidos atrasados"
          value={data ? data.overdueOrders.count : '—'}
          hint="con la fecha de envío vencida"
          variant={data && data.overdueOrders.count > 0 ? 'danger' : 'neutral'}
          to="/pedidos?filtro=atrasados"
        />
        <KPICard
          icon={ShoppingCart}
          label="Pedidos en curso"
          value={data ? inProgress : '—'}
          hint={
            data ? `${data.orders.EN_ALMACEN} listos para despachar` : undefined
          }
          variant="accent"
          to="/pedidos"
        />
        <KPICard
          icon={PackageSearch}
          label="Valor de inventario"
          value={
            data ? formatMoneyCompact(data.inventory.totalStockValue) : '—'
          }
          title={data ? formatMoney(data.inventory.totalStockValue) : undefined}
          hint={
            data
              ? data.inventory.lowStockCount > 0
                ? `${data.inventory.lowStockCount} con stock crítico`
                : 'todo sobre el mínimo'
              : undefined
          }
          variant={
            data && data.inventory.lowStockCount > 0 ? 'warning' : 'neutral'
          }
          to="/inventario"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {data && <PipelineCard orders={data.orders} />}

          <Card className="p-5">
            <CardHeader
              title="Atrasados"
              description="Pedidos con la fecha prometida vencida, del más antiguo al más reciente."
            />
            {!data || data.overdueOrders.orders.length === 0 ? (
              <p className="text-ink-muted py-4 text-center text-sm">
                {isLoading ? 'Cargando…' : 'Ningún pedido atrasado.'}
              </p>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {data.overdueOrders.orders.map((order) => {
                  const state = deliveryState(order);
                  return (
                    <li key={order.id}>
                      <Link
                        to={`/pedidos/${order.id}`}
                        className="hover:bg-chrome group flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 transition-colors"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="figures text-ink-faint w-10 shrink-0 text-[13px]">
                            #{order.number}
                          </span>
                          <div className="min-w-0">
                            <p className="text-ink truncate text-sm font-medium">
                              {order.customerName}
                            </p>
                            <p className="text-ink-muted text-xs">
                              Prometido para el{' '}
                              {formatDateOnly(order.estimatedDeliveryDate)}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <OrderStatusBadge status={order.status} />
                          <span className="figures text-danger w-20 text-right text-[13px] font-semibold">
                            {state.kind === 'overdue' ? `+${state.days} d` : ''}
                          </span>
                          <ArrowRight className="text-ink-faint group-hover:text-ink h-4 w-4 transition-all duration-200 group-hover:translate-x-0.5" />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <CardHeader
              title="Productos con stock crítico"
              action={<ClipboardList className="text-ink-faint h-4.5 w-4.5" />}
            />
            {!data || data.inventory.lowStockProducts.length === 0 ? (
              <p className="text-ink-muted py-4 text-center text-sm">
                {isLoading
                  ? 'Cargando…'
                  : 'Todo el stock está sobre el mínimo.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.inventory.lowStockProducts.map((product) => {
                  const min = Number(product.minStock ?? 0);
                  const ratio =
                    min > 0
                      ? Math.min(1, Number(product.currentStock) / min)
                      : 0;
                  return (
                    <li key={product.id} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="text-ink truncate">
                          {product.sku} — {product.name}
                        </span>
                        <span className="figures text-ink-muted shrink-0 text-xs">
                          {formatQuantity(product.currentStock)} / mín.{' '}
                          {product.minStock
                            ? formatQuantity(product.minStock)
                            : '—'}
                        </span>
                      </div>
                      <div className="bg-chrome-strong h-1 overflow-hidden rounded-full">
                        <div
                          className="bg-warning h-full rounded-full"
                          style={{ width: `${Math.round(ratio * 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <CardHeader
              title="Actividad reciente"
              action={<History className="text-ink-faint h-4.5 w-4.5" />}
            />
            {!data || data.recentActivity.length === 0 ? (
              <p className="text-ink-muted py-4 text-center text-sm">
                {isLoading ? 'Cargando…' : 'Sin actividad registrada todavía.'}
              </p>
            ) : (
              <ol className="border-line ml-1.5 flex flex-col gap-4 border-l pl-4">
                {data.recentActivity.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="bg-accent ring-surface-raised absolute top-1.5 -left-[21px] h-2 w-2 rounded-full ring-4" />
                    <p className="text-ink text-[13px] leading-5">
                      <span className="font-medium">{entry.userName}</span>{' '}
                      {auditActionLabel(entry.action)}{' '}
                      <span className="text-ink-secondary">
                        {auditEntityLabel(entry.entity).toLowerCase()}
                      </span>
                    </p>
                    <p className="text-ink-faint text-xs">
                      {formatDateTime(entry.timestamp)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {data && data.recentWarnings > 0 && (
            <Card className="border-warning-line bg-warning-surface flex items-start gap-3 p-4">
              <Bell className="text-warning mt-0.5 h-4.5 w-4.5 shrink-0" />
              <div>
                <p className="text-ink text-[13px] font-medium">
                  {data.recentWarnings} advertencias del sistema en las últimas
                  24 h
                </p>
                <p className="text-ink-muted text-xs">
                  Quedan en el registro de errores exportable (menú de usuario).
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-ink text-[15px] font-semibold tracking-tight">
            Ventas recientes
          </h2>
          <DataTable
            columns={saleColumns}
            rows={data?.recentSales ?? []}
            rowKey={(row) => row.id}
            isLoading={isLoading}
            emptyMessage="Todavía no hay pedidos registrados."
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-ink text-[15px] font-semibold tracking-tight">
            Compras recientes
          </h2>
          <DataTable
            columns={purchaseColumns}
            rows={data?.recentPurchases ?? []}
            rowKey={(row) => row.id}
            isLoading={isLoading}
            emptyMessage="Todavía no hay compras registradas."
          />
        </section>
      </div>
    </div>
  );
}

export default DashboardPage;
