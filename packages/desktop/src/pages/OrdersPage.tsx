import { useState } from 'react';
import { Eye, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { OrderForm } from '../components/orders/OrderForm';
import { OrderStatusActions } from '../components/orders/OrderStatusActions';
import { useOrders } from '../hooks/useOrders';
import { getCurrentUser } from '../lib/current-user';
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

// Todos primero, luego el orden natural del flujo — no alfabético.
const statusFilters: { value: OrderStatus | undefined; label: string }[] = [
  { value: undefined, label: 'Todos' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'EN_PRODUCCION', label: 'En producción' },
  { value: 'EN_ALMACEN', label: 'En almacén' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CO', { dateStyle: 'short' });
}

// El total no viene del backend (deriva de las líneas, ver schema.prisma) —
// se calcula igual aquí, no se inventa un campo que el servidor no manda.
function orderTotal(order: Order): number {
  return order.items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
    0,
  );
}

function OrdersPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | undefined>(
    undefined,
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const ordersQuery = useOrders({
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter,
  });
  const orders = ordersQuery.data?.data ?? [];

  function selectStatusFilter(status: OrderStatus | undefined) {
    setStatusFilter(status);
    setPage(1);
  }

  const columns: DataTableColumn<Order>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (order) => formatDate(order.createdAt),
    },
    {
      key: 'customer',
      header: 'Cliente',
      render: (order) => order.customer.name,
    },
    {
      key: 'warehouse',
      header: 'Bodega',
      render: (order) => order.warehouse.name,
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
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: '',
            className: 'text-right',
            render: (order: Order) => <OrderStatusActions order={order} />,
          } satisfies DataTableColumn<Order>,
        ]
      : []),
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
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-ink text-xl font-medium">Pedidos</h1>
          <p className="text-ink-muted mt-1 text-sm">
            Pedidos de venta y su estado de entrega.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nuevo pedido
          </Button>
        )}
      </div>

      <div
        role="group"
        aria-label="Filtrar por estado"
        className="flex flex-wrap gap-1.5"
      >
        {statusFilters.map((filter) => {
          const isActive = filter.value === statusFilter;
          return (
            <button
              key={filter.label}
              type="button"
              aria-pressed={isActive}
              onClick={() => selectStatusFilter(filter.value)}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-line text-ink-muted hover:bg-chrome-strong hover:text-ink'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        rows={orders}
        rowKey={(order) => order.id}
        isLoading={ordersQuery.isLoading}
        emptyMessage="No hay pedidos registrados."
      />

      {ordersQuery.data && (
        <Pagination
          page={ordersQuery.data.meta.page}
          totalPages={ordersQuery.data.meta.totalPages}
          onPageChange={setPage}
        />
      )}

      {isCreateModalOpen && (
        <Modal title="Nuevo pedido" onClose={() => setIsCreateModalOpen(false)}>
          <OrderForm onSuccess={() => setIsCreateModalOpen(false)} />
        </Modal>
      )}
    </div>
  );
}

export default OrdersPage;
