import { useState } from 'react';
import {
  Boxes,
  FileSpreadsheet,
  TrendingUp,
  Trophy,
  Wallet,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { KPICard } from '../components/ui/KPICard';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';
import { useInventoryReport } from '../hooks/useInventoryReport';
import { useReceivablesReport } from '../hooks/useReceivablesReport';
import { dateRangeSearchParams, useSalesReport } from '../hooks/useSalesReport';
import { useTopProducts } from '../hooks/useTopProducts';
import { downloadFile } from '../lib/download-file';
import {
  formatDate,
  formatMoney,
  formatMoneyCompact,
  formatQuantity,
} from '../lib/format';
import type {
  InventoryReportRow,
  ReceivablesRow,
  TopProductRow,
} from '../types/report';

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

type ReportView = 'cartera' | 'ventas' | 'productos' | 'inventario';

const VIEWS: ReportView[] = ['cartera', 'ventas', 'productos', 'inventario'];

// Antigüedad del cobro más viejo: a los 30 días empieza a preocupar, a los
// 60 ya es cartera vencida en la práctica comercial.
function agingBadge(days: number) {
  if (days >= 60) {
    return <Badge variant="danger">{days} días</Badge>;
  }
  if (days >= 30) {
    return <Badge variant="warning">{days} días</Badge>;
  }
  return (
    <Badge variant="neutral">{days === 1 ? '1 día' : `${days} días`}</Badge>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      <FileSpreadsheet />
      Exportar a Excel
    </Button>
  );
}

function ReceivablesView() {
  const receivablesQuery = useReceivablesReport();
  const rows = receivablesQuery.data ?? [];
  const total = rows.reduce((sum, row) => sum + Number(row.balance), 0);
  const oldest = rows.reduce((max, row) => Math.max(max, row.daysPending), 0);

  const columns: DataTableColumn<ReceivablesRow>[] = [
    {
      key: 'customer',
      header: 'Cliente',
      render: (row) => (
        <Link
          to={`/clientes/${row.customerId}`}
          className="text-ink hover:text-accent font-medium transition-colors"
        >
          {row.customerName}
        </Link>
      ),
    },
    {
      key: 'remissions',
      header: 'Remisiones',
      className: 'text-right figures',
      render: (row) => row.remissionCount,
    },
    {
      key: 'billed',
      header: 'Despachado',
      className: 'text-right figures',
      render: (row) => formatMoney(row.totalBilled),
    },
    {
      key: 'paid',
      header: 'Abonado',
      className: 'text-right figures text-ink-secondary',
      render: (row) => formatMoney(row.totalPaid),
    },
    {
      key: 'balance',
      header: 'Saldo',
      className: 'text-right',
      render: (row) => (
        <span className="figures text-danger font-semibold">
          {formatMoney(row.balance)}
        </span>
      ),
    },
    {
      key: 'aging',
      header: 'Más antigua',
      className: 'text-right',
      render: (row) => (
        <div className="flex flex-col items-end gap-0.5">
          {agingBadge(row.daysPending)}
          <span className="text-ink-faint text-[11px]">
            desde {formatDate(row.oldestPendingAt)}
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard
          icon={Wallet}
          label="Total por cobrar"
          value={formatMoneyCompact(total)}
          title={formatMoney(total)}
          variant={total > 0 ? 'danger' : 'success'}
        />
        <KPICard
          icon={Boxes}
          label="Clientes con saldo"
          value={rows.length}
          variant="neutral"
        />
        <KPICard
          icon={TrendingUp}
          label="Cobro más antiguo"
          value={rows.length > 0 ? `${oldest} días` : '—'}
          variant={
            oldest >= 60 ? 'danger' : oldest >= 30 ? 'warning' : 'neutral'
          }
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-ink-muted text-[13px]">
          Remisiones vigentes que no están pagadas por completo, agrupadas por
          cliente.
        </p>
        <ExportButton
          onClick={() =>
            void downloadFile('/reports/cartera/excel', 'cartera.xlsx')
          }
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.customerId}
        isLoading={receivablesQuery.isLoading}
        emptyMessage="Nadie debe nada."
        emptyHint="Todas las remisiones despachadas están pagadas."
        rowTone={(row) => (row.daysPending >= 60 ? 'danger' : undefined)}
      />
    </div>
  );
}

function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('vista') as ReportView | null;
  const view: ReportView =
    requested && VIEWS.includes(requested) ? requested : 'cartera';
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

  // Cada export manda los mismos filtros que su reporte en pantalla — la
  // hoja de Excel es solo otra presentación de los mismos números.
  function exportSalesExcel() {
    const query = dateRangeSearchParams(dateParams).toString();
    void downloadFile(
      `/reports/ventas/excel${query ? `?${query}` : ''}`,
      'ventas.xlsx',
    );
  }

  function exportTopProductsExcel() {
    const search = dateRangeSearchParams(dateParams);
    search.set('sortOrder', rankOrder);
    void downloadFile(
      `/reports/productos-mas-vendidos/excel?${search.toString()}`,
      'productos-mas-vendidos.xlsx',
    );
  }

  function exportInventoryExcel() {
    void downloadFile('/reports/inventario/excel', 'inventario.xlsx');
  }

  const rankedProducts: RankedProductRow[] = (topProductsQuery.data ?? []).map(
    (row, index) => ({ ...row, rank: index + 1 }),
  );

  const inventoryRows = inventoryQuery.data ?? [];
  const totalInventoryValue = inventoryRows.reduce(
    (sum, row) => sum + Number(row.stockValue),
    0,
  );

  const topProductColumns: DataTableColumn<RankedProductRow>[] = [
    {
      key: 'rank',
      header: '#',
      render: (row) => (
        <span
          className={`figures inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold ${
            row.rank <= 3 && rankOrder === 'desc'
              ? 'bg-accent-surface text-accent'
              : 'text-ink-muted'
          }`}
        >
          {row.rank}
        </span>
      ),
    },
    {
      key: 'product',
      header: 'Producto',
      render: (row) => `${row.sku} — ${row.name}`,
    },
    {
      key: 'quantitySold',
      header: 'Cantidad vendida',
      className: 'text-right figures',
      render: (row) => formatQuantity(row.quantitySold),
    },
    {
      key: 'revenue',
      header: 'Ingresos',
      className: 'text-right figures',
      render: (row) => formatMoney(row.revenue),
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
      className: 'text-right figures',
      render: (row) => formatQuantity(row.stock),
    },
    {
      key: 'averageCost',
      header: 'Costo promedio',
      className: 'text-right figures',
      render: (row) => formatMoney(row.averageCost),
    },
    {
      key: 'stockValue',
      header: 'Valor',
      className: 'text-right figures',
      render: (row) => formatMoney(row.stockValue),
    },
  ];

  const dateFilters = (
    <div className="flex items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-ink-muted text-xs font-medium">Desde</span>
        <input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className="field h-8 px-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-ink-muted text-xs font-medium">Hasta</span>
        <input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className="field h-8 px-3"
        />
      </label>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="General"
        title="Reportes"
        description="Cartera, ventas, ranking de productos e inventario valorizado — cada uno exportable a Excel con los mismos filtros que ves en pantalla."
      />

      <Tabs<ReportView>
        label="Reportes"
        value={view}
        onChange={(next) => setSearchParams({ vista: next }, { replace: true })}
        options={[
          { value: 'cartera', label: 'Cartera', icon: Wallet },
          { value: 'ventas', label: 'Ventas', icon: TrendingUp },
          { value: 'productos', label: 'Más vendidos', icon: Trophy },
          { value: 'inventario', label: 'Inventario', icon: Boxes },
        ]}
      />

      {view === 'cartera' && <ReceivablesView />}

      {view === 'ventas' && (
        <section className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            {dateFilters}
            <ExportButton onClick={exportSalesExcel} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KPICard
              icon={Boxes}
              label="Pedidos"
              value={salesQuery.data ? salesQuery.data.orderCount : '—'}
              variant="neutral"
            />
            <KPICard
              icon={TrendingUp}
              label="Unidades vendidas"
              value={
                salesQuery.data
                  ? formatQuantity(salesQuery.data.totalQuantity)
                  : '—'
              }
              variant="neutral"
            />
            <KPICard
              icon={Wallet}
              label="Ingresos"
              value={
                salesQuery.data
                  ? formatMoney(salesQuery.data.totalRevenue)
                  : '—'
              }
              variant="accent"
            />
          </div>
          <p className="text-ink-faint text-xs">
            Pedidos tomados en el rango (sin cancelados), por la fecha en que se
            crearon.
          </p>
        </section>
      )}

      {view === 'productos' && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            {dateFilters}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={rankOrder === 'desc' ? 'primary' : 'secondary'}
                onClick={() => setRankOrder('desc')}
              >
                Más vendidos
              </Button>
              <Button
                size="sm"
                variant={rankOrder === 'asc' ? 'primary' : 'secondary'}
                onClick={() => setRankOrder('asc')}
              >
                Menos vendidos
              </Button>
              <ExportButton onClick={exportTopProductsExcel} />
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
      )}

      {view === 'inventario' && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-ink-muted text-[13px]">
              Valor total:{' '}
              <span className="figures text-ink font-semibold">
                {formatMoney(totalInventoryValue)}
              </span>
            </p>
            <ExportButton onClick={exportInventoryExcel} />
          </div>
          <DataTable
            columns={inventoryColumns}
            rows={inventoryRows}
            rowKey={(row) => row.id}
            isLoading={inventoryQuery.isLoading}
            emptyMessage="No hay productos activos."
          />
        </section>
      )}
    </div>
  );
}

export default ReportsPage;
