import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { FilterChips } from '../components/ui/FilterChips';
import { Modal } from '../components/ui/Modal';
import { DetailLink } from '../components/ui/DetailLink';
import { PageHeader } from '../components/ui/PageHeader';
import { Pagination } from '../components/ui/Pagination';
import { OrderForm } from '../components/orders/OrderForm';
import { OrderStatusActions } from '../components/orders/OrderStatusActions';
import {
  DeliveryDate,
  OrderStatusBadge,
} from '../components/orders/OrderBadges';
import { useDashboardSummary } from '../hooks/useDashboardSummary';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useOrders } from '../hooks/useOrders';
import { getCurrentUser } from '../lib/current-user';
import { formatDate, formatDuration, formatMoney } from '../lib/format';
import {
  currentStationSince,
  deliveredFor,
  deliveryState,
  isOrderOpen,
  orderTotal,
} from '../lib/order-status';
import type { Order, OrderStatus } from '../types/order';

const PAGE_SIZE = 20;

type OrderFilter = OrderStatus | 'ATRASADOS' | undefined;

// Proporción despachada del pedido (sin remisiones anuladas): una barra
// corta dice "a medias" sin abrir el detalle.
function dispatchProgress(order: Order): number {
  const ordered = order.items.reduce((sum, i) => sum + Number(i.quantity), 0);
  if (ordered === 0) {
    return 0;
  }
  const delivered = order.items.reduce(
    (sum, item) => sum + deliveredFor(order, item.id),
    0,
  );
  return Math.min(1, delivered / ordered);
}

function OrdersPage() {
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  // ?filtro=atrasados llega desde el KPI del dashboard.
  const [filter, setFilter] = useState<OrderFilter>(
    searchParams.get('filtro') === 'atrasados' ? 'ATRASADOS' : undefined,
  );
  const [orderSearch, setOrderSearch] = useState('');
  const debouncedSearch = useDebouncedValue(orderSearch.trim(), 300);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;
  const summary = useDashboardSummary().data;

  const ordersQuery = useOrders({
    page,
    pageSize: PAGE_SIZE,
    status: filter === 'ATRASADOS' ? undefined : filter,
    overdue: filter === 'ATRASADOS',
    search: debouncedSearch || undefined,
    // Atrasados: primero el que más tiempo lleva incumplido.
    ...(filter === 'ATRASADOS'
      ? { sortBy: 'estimatedDeliveryDate' as const, sortOrder: 'asc' as const }
      : {}),
  });
  const orders = ordersQuery.data?.data ?? [];
  const now = new Date();

  function selectFilter(value: OrderFilter) {
    setFilter(value);
    setPage(1);
  }

  const columns: DataTableColumn<Order>[] = [
    {
      key: 'number',
      header: 'Pedido',
      render: (order) => (
        <div className="flex flex-col">
          <span className="figures text-ink font-semibold">
            #{order.number}
          </span>
          <span className="text-ink-faint text-xs whitespace-nowrap">
            {formatDate(order.createdAt)}
          </span>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      render: (order) => (
        <div className="flex max-w-56 flex-col">
          <span className="text-ink truncate font-medium">
            {order.customer.name}
          </span>
          <span className="text-ink-faint truncate text-xs">
            {order.items.length === 1
              ? order.items[0].product.name
              : `${order.items.length} productos`}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (order) => (
        <div className="flex flex-col items-start gap-1">
          <OrderStatusBadge status={order.status} />
          {isOrderOpen(order.status) && (
            <span className="text-ink-faint text-xs">
              hace {formatDuration(currentStationSince(order), now)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'delivery',
      header: 'Envío estimado',
      render: (order) => <DeliveryDate order={order} compact />,
    },
    {
      key: 'progress',
      header: 'Despachado',
      render: (order) => {
        const progress = dispatchProgress(order);
        return (
          <div className="flex w-24 flex-col gap-1">
            <div className="bg-chrome-strong h-1.5 overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  progress >= 1 ? 'bg-success' : 'bg-accent'
                }`}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <span className="figures text-ink-faint text-[11px]">
              {Math.round(progress * 100)}%
            </span>
          </div>
        );
      },
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right',
      render: (order) => (
        <span className="figures text-ink font-medium">
          {formatMoney(orderTotal(order))}
        </span>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: '',
            className: 'text-right',
            render: (order: Order) => (
              <OrderStatusActions order={order} compact />
            ),
          } satisfies DataTableColumn<Order>,
        ]
      : []),
    {
      key: 'detail',
      header: '',
      className: 'w-10 text-right',
      render: (order) => (
        <DetailLink
          to={`/pedidos/${order.id}`}
          label={`Ver detalle del pedido ${order.number}`}
        />
      ),
    },
  ];

  const counts = summary?.orders;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operación"
        title="Pedidos"
        description="Cada pedido de la toma al despacho: en qué estación está, cuánto lleva ahí y si va a tiempo para la fecha prometida."
        actions={
          isAdmin && (
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus />
              Nuevo pedido
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips<OrderFilter>
          label="Filtrar por estado"
          value={filter}
          onChange={selectFilter}
          options={[
            { value: undefined, label: 'Todos' },
            {
              value: 'ATRASADOS',
              label: 'Atrasados',
              count: summary?.overdueOrders.count,
            },
            {
              value: 'PENDIENTE',
              label: 'Pendiente',
              count: counts?.PENDIENTE,
            },
            {
              value: 'EN_PRODUCCION',
              label: 'En producción',
              count: counts?.EN_PRODUCCION,
            },
            {
              value: 'EN_ALMACEN',
              label: 'En almacén',
              count: counts?.EN_ALMACEN,
            },
            { value: 'DESPACHADO', label: 'Despachado' },
            { value: 'CANCELADO', label: 'Cancelado' },
          ]}
        />
        <div className="relative">
          <Search className="text-ink-faint pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Buscar pedido por número o cliente"
            placeholder="N.º de pedido o cliente"
            value={orderSearch}
            onChange={(event) => {
              setOrderSearch(event.target.value);
              setPage(1);
            }}
            className="field h-8 w-56 pr-3 pl-8"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={orders}
        rowKey={(order) => order.id}
        isLoading={ordersQuery.isLoading}
        emptyMessage={
          debouncedSearch
            ? `Ningún pedido coincide con «${debouncedSearch}».`
            : filter === 'ATRASADOS'
              ? 'Ningún pedido atrasado.'
              : 'No hay pedidos registrados.'
        }
        emptyHint={
          filter === 'ATRASADOS'
            ? 'Todo lo que está en curso va a tiempo para su fecha prometida.'
            : undefined
        }
        rowTone={(order) =>
          deliveryState(order).kind === 'overdue' ? 'danger' : undefined
        }
      />

      {ordersQuery.data && (
        <Pagination
          page={ordersQuery.data.meta.page}
          totalPages={ordersQuery.data.meta.totalPages}
          onPageChange={setPage}
        />
      )}

      {isCreateModalOpen && (
        <Modal
          title="Nuevo pedido"
          description="El stock no se mueve hasta que el pedido llega a almacén."
          size="lg"
          onClose={() => setIsCreateModalOpen(false)}
        >
          <OrderForm onSuccess={() => setIsCreateModalOpen(false)} />
        </Modal>
      )}
    </div>
  );
}

export default OrdersPage;
