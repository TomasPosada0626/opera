import { useState } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { CompleteOrderAction } from '../components/production/CompleteOrderAction';
import { ProductionOrderForm } from '../components/production/ProductionOrderForm';
import { useProductionOrders } from '../hooks/useProductionOrders';
import { useHasSeveralWarehouses } from '../hooks/useWarehouses';
import { getCurrentUser } from '../lib/current-user';
import { formatDate, formatMoney, formatQuantity } from '../lib/format';
import type {
  ProductionOrder,
  ProductionOrderStatus,
} from '../types/production';

const PAGE_SIZE = 20;

const statusBadgeVariant: Record<
  ProductionOrderStatus,
  'success' | 'warning' | 'danger'
> = {
  PENDIENTE: 'warning',
  COMPLETADA: 'success',
  CANCELADA: 'danger',
};

const statusLabel: Record<ProductionOrderStatus, string> = {
  PENDIENTE: 'Pendiente',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
};

function ProductionOrdersPage() {
  const [page, setPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const ordersQuery = useProductionOrders({ page, pageSize: PAGE_SIZE });
  const showWarehouses = useHasSeveralWarehouses();
  const orders = ordersQuery.data?.data ?? [];

  const columns: DataTableColumn<ProductionOrder>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      className: 'whitespace-nowrap',
      render: (order) => formatDate(order.createdAt),
    },
    {
      key: 'order',
      header: 'Pedido',
      render: (order) =>
        order.order ? (
          <Link
            to={`/pedidos/${order.order.id}`}
            className="hover:text-accent flex flex-col transition-colors"
          >
            <span className="figures text-ink font-medium">
              No. {order.order.number}
            </span>
            <span className="text-ink-faint max-w-40 truncate text-xs">
              {order.order.customer.name}
            </span>
          </Link>
        ) : (
          <span className="text-ink-faint text-xs">Para stock</span>
        ),
    },
    {
      key: 'product',
      header: 'Producto',
      render: (order) => (
        <div className="flex flex-col">
          <span className="text-ink font-medium">{order.product.name}</span>
          <span className="code text-ink-faint text-xs">
            {order.product.sku}
          </span>
        </div>
      ),
    },
    ...(showWarehouses
      ? [
          {
            key: 'warehouse',
            header: 'Bodega',
            className: 'whitespace-nowrap',
            render: (order: ProductionOrder) => (
              <span className="text-ink-secondary">{order.warehouse.name}</span>
            ),
          },
        ]
      : []),
    {
      key: 'quantity',
      header: 'Cantidad',
      className: 'text-right figures',
      render: (order) => (
        <div className="flex flex-col items-end">
          <span>{formatQuantity(order.quantity)}</span>
          {order.producedQuantity !== null &&
            Number(order.producedQuantity) !== Number(order.quantity) && (
              <span className="text-warning text-xs">
                Salieron {formatQuantity(order.producedQuantity)}
              </span>
            )}
        </div>
      ),
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
      key: 'unitCost',
      header: 'Costo unitario',
      className: 'text-right figures whitespace-nowrap',
      render: (order) =>
        order.unitCost === null ? (
          <span className="text-ink-faint">—</span>
        ) : (
          formatMoney(order.unitCost)
        ),
    },
    ...(isAdmin
      ? [
          {
            key: 'action',
            header: '',
            className: 'text-right',
            render: (order: ProductionOrder) => (
              <CompleteOrderAction order={order} />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operación"
        title="Producción"
        description="Los pedidos enviados a producción aparecen acá. Al completar se indica cuántas salieron buenas: eso entra al inventario, y cuando se completa todo lo de un pedido, el pedido pasa solo a almacén."
        actions={
          isAdmin && (
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus />
              Nueva orden
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        rows={orders}
        rowKey={(order) => order.id}
        isLoading={ordersQuery.isLoading}
        emptyMessage="No hay órdenes de producción."
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
          title="Nueva orden de producción"
          onClose={() => setIsCreateModalOpen(false)}
        >
          <ProductionOrderForm onSuccess={() => setIsCreateModalOpen(false)} />
        </Modal>
      )}
    </div>
  );
}

export default ProductionOrdersPage;
