import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { CompleteOrderAction } from '../components/production/CompleteOrderAction';
import { ProductionOrderForm } from '../components/production/ProductionOrderForm';
import { useProductionOrders } from '../hooks/useProductionOrders';
import { getCurrentUser } from '../lib/current-user';
import type {
  ProductionOrder,
  ProductionOrderStatus,
} from '../types/production';

const PAGE_SIZE = 20;

const statusBadgeVariant: Record<ProductionOrderStatus, 'success' | 'warning'> =
  {
    PENDIENTE: 'warning',
    EN_PROCESO: 'warning',
    COMPLETADA: 'success',
  };

const statusLabel: Record<ProductionOrderStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  COMPLETADA: 'Completada',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CO', { dateStyle: 'short' });
}

function ProductionOrdersPage() {
  const [page, setPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const ordersQuery = useProductionOrders({ page, pageSize: PAGE_SIZE });
  const orders = ordersQuery.data?.data ?? [];

  const columns: DataTableColumn<ProductionOrder>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (order) => formatDate(order.createdAt),
    },
    {
      key: 'product',
      header: 'Producto',
      render: (order) => `${order.product.sku} — ${order.product.name}`,
    },
    {
      key: 'warehouse',
      header: 'Bodega',
      render: (order) => order.warehouse.name,
    },
    {
      key: 'quantity',
      header: 'Cantidad',
      className: 'text-right tabular-nums',
      render: (order) => order.quantity,
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
      className: 'text-right tabular-nums',
      render: (order) => order.unitCost ?? '—',
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
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-ink text-xl font-medium">Producción</h1>
          <p className="text-ink-muted mt-1 text-sm">
            Órdenes de producción y su estado.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nueva orden
          </Button>
        )}
      </div>

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
