import { useState } from 'react';
import { useParams } from 'react-router';
import { Badge } from '../components/ui/Badge';
import { PageHeader } from '../components/ui/PageHeader';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { useKardex } from '../hooks/useKardex';
import { useProduct } from '../hooks/useProduct';
import { useHasSeveralWarehouses, useWarehouses } from '../hooks/useWarehouses';
import { formatMoney, formatQuantity } from '../lib/format';
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

// Con año: el Kardex es un historial largo y "25 oct" sin año se presta
// a confusión.
function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function KardexPage() {
  const { productId } = useParams<{ productId: string }>();
  const [page, setPage] = useState(1);
  const [warehouseId, setWarehouseId] = useState('');

  const productQuery = useProduct(productId ?? '');
  const warehousesQuery = useWarehouses();
  const showWarehouses = useHasSeveralWarehouses();
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
      className: 'whitespace-nowrap',
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
      className: 'text-right figures whitespace-nowrap',
      render: (entry) => {
        const quantity = Number(entry.quantity);
        return (
          <span
            className={`font-medium ${quantity < 0 ? 'text-danger' : 'text-success'}`}
          >
            {quantity > 0 ? '+' : ''}
            {formatQuantity(quantity)} {unitAbbreviation}
          </span>
        );
      },
    },
    {
      key: 'unitCost',
      header: 'Costo unitario',
      className: 'text-right figures whitespace-nowrap',
      render: (entry) =>
        entry.unitCost === null ? (
          <span className="text-ink-faint">—</span>
        ) : (
          formatMoney(entry.unitCost)
        ),
    },
    ...(showWarehouses
      ? [
          {
            key: 'warehouse',
            header: 'Bodega',
            render: (entry: StockMovementEntry) => entry.warehouse.name,
          },
        ]
      : []),
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
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ to: '/inventario', label: 'Volver a inventario' }}
        eyebrow="Kardex"
        title={productQuery.data ? productQuery.data.name : 'Kardex'}
        description={
          productQuery.data
            ? `SKU ${productQuery.data.sku} · historial completo de entradas, salidas y ajustes. Ningún movimiento se edita ni se borra.`
            : 'Historial de movimientos de inventario.'
        }
      />

      {showWarehouses && (
        <select
          value={warehouseId}
          onChange={(event) => handleWarehouseChange(event.target.value)}
          aria-label="Filtrar por bodega"
          className="field h-9 w-full max-w-xs px-3"
        >
          <option value="">Todas las bodegas</option>
          {warehousesQuery.data?.data.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>
      )}

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
