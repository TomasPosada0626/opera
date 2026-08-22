import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { useInventoryReport } from '../hooks/useInventoryReport';
import { useSalesReport } from '../hooks/useSalesReport';
import { useTopProducts } from '../hooks/useTopProducts';
import type { InventoryReportRow, TopProductRow } from '../types/report';

function formatMoney(value: number): string {
  return value.toLocaleString('es-CO', { minimumFractionDigits: 2 });
}

function formatQuantity(value: string): string {
  return Number(value).toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

// El backend trata `to` como exclusivo ([from, to), ver reports.service.ts)
// para no adivinar si un día suelto debe incluirse completo — el date
// picker sí espera que el día elegido cuente entero, así que se manda el
// inicio del día siguiente como límite superior.
function nextDayIso(date: string): string {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return next.toISOString().slice(0, 10);
}

interface RankedProductRow extends TopProductRow {
  rank: number;
}

function ReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rankOrder, setRankOrder] = useState<'desc' | 'asc'>('desc');

  const dateParams = {
    from: from || undefined,
    to: to ? nextDayIso(to) : undefined,
  };

  const salesQuery = useSalesReport(dateParams);
  const topProductsQuery = useTopProducts({
    ...dateParams,
    sortOrder: rankOrder,
  });
  const inventoryQuery = useInventoryReport();

  const rankedProducts: RankedProductRow[] = (topProductsQuery.data ?? []).map(
    (row, index) => ({ ...row, rank: index + 1 }),
  );

  const inventoryRows = inventoryQuery.data ?? [];
  const totalInventoryValue = inventoryRows.reduce(
    (sum, row) => sum + Number(row.stockValue),
    0,
  );

  const topProductColumns: DataTableColumn<RankedProductRow>[] = [
    { key: 'rank', header: '#', render: (row) => row.rank },
    {
      key: 'product',
      header: 'Producto',
      render: (row) => `${row.sku} — ${row.name}`,
    },
    {
      key: 'quantitySold',
      header: 'Cantidad vendida',
      className: 'text-right tabular-nums',
      render: (row) => formatQuantity(row.quantitySold),
    },
    {
      key: 'revenue',
      header: 'Ingresos',
      className: 'text-right tabular-nums',
      render: (row) => formatMoney(Number(row.revenue)),
    },
  ];

  const inventoryColumns: DataTableColumn<InventoryReportRow>[] = [
    {
      key: 'product',
      header: 'Producto',
      render: (row) => `${row.sku} — ${row.name}`,
    },
    { key: 'category', header: 'Categoría', render: (row) => row.category },
    { key: 'unit', header: 'Unidad', render: (row) => row.unit },
    {
      key: 'stock',
      header: 'Stock',
      className: 'text-right tabular-nums',
      render: (row) => formatQuantity(row.stock),
    },
    {
      key: 'averageCost',
      header: 'Costo promedio',
      className: 'text-right tabular-nums',
      render: (row) => formatMoney(Number(row.averageCost)),
    },
    {
      key: 'stockValue',
      header: 'Valor',
      className: 'text-right tabular-nums',
      render: (row) => formatMoney(Number(row.stockValue)),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-ink text-xl font-medium">Reportes</h1>
        <p className="text-ink-muted mt-1 text-sm">
          Ventas, productos más vendidos e inventario actual.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-ink text-lg font-medium">Ventas</h2>
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-ink-muted text-xs font-medium">Desde</span>
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-muted text-xs font-medium">Hasta</span>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2"
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="flex flex-col gap-1">
            <span className="text-ink-muted text-sm font-medium">Pedidos</span>
            <span className="text-ink text-2xl font-semibold">
              {salesQuery.data ? salesQuery.data.orderCount : '—'}
            </span>
          </Card>
          <Card className="flex flex-col gap-1">
            <span className="text-ink-muted text-sm font-medium">
              Unidades vendidas
            </span>
            <span className="text-ink text-2xl font-semibold">
              {salesQuery.data
                ? formatQuantity(salesQuery.data.totalQuantity)
                : '—'}
            </span>
          </Card>
          <Card className="flex flex-col gap-1">
            <span className="text-ink-muted text-sm font-medium">Ingresos</span>
            <span className="text-ink text-2xl font-semibold">
              {salesQuery.data
                ? formatMoney(Number(salesQuery.data.totalRevenue))
                : '—'}
            </span>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-ink text-lg font-medium">
            Productos más vendidos
          </h2>
          <div className="flex gap-2">
            <Button
              variant={rankOrder === 'desc' ? 'primary' : 'secondary'}
              onClick={() => setRankOrder('desc')}
            >
              Más vendidos
            </Button>
            <Button
              variant={rankOrder === 'asc' ? 'primary' : 'secondary'}
              onClick={() => setRankOrder('asc')}
            >
              Menos vendidos
            </Button>
          </div>
        </div>
        <DataTable
          columns={topProductColumns}
          rows={rankedProducts}
          rowKey={(row) => row.productId}
          isLoading={topProductsQuery.isLoading}
          emptyMessage="No hay ventas registradas en el rango seleccionado."
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-ink text-lg font-medium">Inventario actual</h2>
          <p className="text-ink-muted text-sm">
            Valor total: {formatMoney(totalInventoryValue)}
          </p>
        </div>
        <DataTable
          columns={inventoryColumns}
          rows={inventoryRows}
          rowKey={(row) => row.id}
          isLoading={inventoryQuery.isLoading}
          emptyMessage="No hay productos activos."
        />
      </section>
    </div>
  );
}

export default ReportsPage;
