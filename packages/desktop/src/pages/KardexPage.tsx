import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Badge } from '../components/ui/Badge';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { useKardex } from '../hooks/useKardex';
import { useProduct } from '../hooks/useProduct';
import { useWarehouses } from '../hooks/useWarehouses';
import type { MovementType, StockMovementEntry } from '../types/inventory';

const PAGE_SIZE = 20;

const movementBadgeVariant: Record<
  MovementType,
  'success' | 'danger' | 'warning'
> = {
  ENTRADA: 'success',
  SALIDA: 'danger',
  AJUSTE: 'warning',
};

const movementLabel: Record<MovementType, string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  AJUSTE: 'Ajuste',
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function KardexPage() {
  const { productId } = useParams<{ productId: string }>();
  const [page, setPage] = useState(1);
  const [warehouseId, setWarehouseId] = useState('');

  const productQuery = useProduct(productId ?? '');
  const warehousesQuery = useWarehouses();
  const kardexQuery = useKardex({
    productId: productId ?? '',
    page,
    pageSize: PAGE_SIZE,
    warehouseId: warehouseId || undefined,
  });
  const movements = kardexQuery.data?.data ?? [];

  function handleWarehouseChange(value: string) {
    setWarehouseId(value);
    setPage(1);
  }

  const unitAbbreviation = productQuery.data?.unit.abbreviation ?? '';

  const columns: DataTableColumn<StockMovementEntry>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (entry) => formatDateTime(entry.createdAt),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (entry) => (
        <Badge variant={movementBadgeVariant[entry.type]}>
          {movementLabel[entry.type]}
        </Badge>
      ),
    },
    {
      key: 'quantity',
      header: 'Cantidad',
      className: 'text-right tabular-nums',
      render: (entry) => `${entry.quantity} ${unitAbbreviation}`.trim(),
    },
    {
      key: 'unitCost',
      header: 'Costo unitario',
      className: 'text-right tabular-nums',
      render: (entry) => entry.unitCost ?? '—',
    },
    {
      key: 'warehouse',
      header: 'Bodega',
      render: (entry) => entry.warehouse.name,
    },
    {
      key: 'user',
      header: 'Usuario',
      render: (entry) => entry.user.name,
    },
    {
      key: 'reason',
      header: 'Motivo',
      render: (entry) => entry.reason ?? '—',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          to="/inventario"
          className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a inventario
        </Link>
        <h1 className="text-ink mt-2 text-xl font-medium">
          Kardex{productQuery.data ? ` — ${productQuery.data.name}` : ''}
        </h1>
        <p className="text-ink-muted mt-1 text-sm">
          {productQuery.data
            ? `SKU ${productQuery.data.sku}`
            : 'Historial de movimientos de inventario.'}
        </p>
      </div>

      <select
        value={warehouseId}
        onChange={(event) => handleWarehouseChange(event.target.value)}
        aria-label="Filtrar por bodega"
        className="border-line bg-surface-raised text-ink focus:border-accent focus:ring-accent/35 w-full max-w-xs rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
      >
        <option value="">Todas las bodegas</option>
        {warehousesQuery.data?.data.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.name}
          </option>
        ))}
      </select>

      <DataTable
        columns={columns}
        rows={movements}
        rowKey={(entry) => entry.id}
        isLoading={kardexQuery.isLoading}
        emptyMessage="Sin movimientos registrados."
      />

      {kardexQuery.data && (
        <Pagination
          page={kardexQuery.data.meta.page}
          totalPages={kardexQuery.data.meta.totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export default KardexPage;
