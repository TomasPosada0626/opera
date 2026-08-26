import { ArrowLeft, Eye } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { useCustomer } from '../hooks/useCustomer';
import { useCustomerBalance } from '../hooks/useCustomerBalance';
import { useOrders } from '../hooks/useOrders';
import type { Order, OrderStatus } from '../types/order';

const PAGE_SIZE = 20;

const statusBadgeVariant: Record<
  OrderStatus,
  'success' | 'warning' | 'danger'
> = {
  PENDIENTE: 'warning',
  EN_PRODUCCION: 'warning',
  EN_ALMACEN: 'success',
  CANCELADO: 'danger',
};

const statusLabel: Record<OrderStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PRODUCCION: 'En producción',
  EN_ALMACEN: 'En almacén',
  CANCELADO: 'Cancelado',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CO', { dateStyle: 'short' });
}

function formatMoney(value: string): string {
  return Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2 });
}

// El total no viene del backend (deriva de las líneas) — se calcula igual
// aquí, mismo patrón que OrdersPage/OrderDetailPage.
function orderTotal(order: Order): number {
  return order.items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
    0,
  );
}

function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();

  const customerQuery = useCustomer(customerId ?? '');
  const customer = customerQuery.data;
  const balanceQuery = useCustomerBalance(customerId ?? '');
  const ordersQuery = useOrders({
    page: 1,
    pageSize: PAGE_SIZE,
    customerId: customerId ?? '',
  });
  const orders = ordersQuery.data?.data ?? [];

  const columns: DataTableColumn<Order>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (order) => formatDate(order.createdAt),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (order) => (
        <Badge variant={statusBadgeVariant[order.status]}>
          {statusLabel[order.status]}
        </Badge>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right tabular-nums',
      render: (order) =>
        orderTotal(order).toLocaleString('es-CO', {
          minimumFractionDigits: 2,
        }),
    },
    {
      key: 'detail',
      header: '',
      className: 'text-right',
      render: (order) => (
        <Link
          to={`/pedidos/${order.id}`}
          className="text-ink-muted hover:text-ink hover:bg-chrome-strong inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors"
        >
          <Eye className="h-4 w-4" />
          Ver detalle
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/clientes"
          className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a clientes
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-ink text-xl font-medium">
            {customer ? customer.name : 'Cliente'}
          </h1>
          {customer && (
            <Badge variant={customer.isActive ? 'success' : 'danger'}>
              {customer.isActive ? 'Activo' : 'Inactivo'}
            </Badge>
          )}
        </div>
      </div>

      {customerQuery.isLoading && (
        <p className="text-ink-muted text-sm">Cargando…</p>
      )}

      {customer && (
        <>
          {balanceQuery.data && (
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <p className="text-ink-muted text-xs font-medium tracking-wide uppercase">
                  Facturado
                </p>
                <p className="text-ink mt-1 text-lg font-medium tabular-nums">
                  {formatMoney(balanceQuery.data.totalBilled)}
                </p>
              </Card>
              <Card>
                <p className="text-ink-muted text-xs font-medium tracking-wide uppercase">
                  Pagado
                </p>
                <p className="text-ink mt-1 text-lg font-medium tabular-nums">
                  {formatMoney(balanceQuery.data.totalPaid)}
                </p>
              </Card>
              <Card>
                <p className="text-ink-muted text-xs font-medium tracking-wide uppercase">
                  Saldo pendiente
                </p>
                <p
                  className={`mt-1 text-lg font-medium tabular-nums ${
                    Number(balanceQuery.data.balance) > 0
                      ? 'text-danger'
                      : 'text-ink'
                  }`}
                >
                  {formatMoney(balanceQuery.data.balance)}
                </p>
              </Card>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <h2 className="text-ink text-lg font-medium">
              Historial de pedidos
            </h2>
            <DataTable
              columns={columns}
              rows={orders}
              rowKey={(order) => order.id}
              isLoading={ordersQuery.isLoading}
              emptyMessage="Este cliente todavía no tiene pedidos."
            />
          </div>
        </>
      )}
    </div>
  );
}

export default CustomerDetailPage;
