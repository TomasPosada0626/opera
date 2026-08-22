import { useState } from 'react';
import { Eye, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { OrderForm } from '../components/orders/OrderForm';
import { useOrders } from '../hooks/useOrders';
import { getCurrentUser } from '../lib/current-user';
import type { Order, OrderStatus } from '../types/order';

const PAGE_SIZE = 20;

const statusBadgeVariant: Record<OrderStatus, 'warning' | 'danger'> = {
  PENDIENTE: 'warning',
  CANCELADO: 'danger',
};

const statusLabel: Record<OrderStatus, string> = {
  PENDIENTE: 'Pendiente',
  CANCELADO: 'Cancelado',
};

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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const ordersQuery = useOrders({ page, pageSize: PAGE_SIZE });
  const orders = ordersQuery.data?.data ?? [];

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
