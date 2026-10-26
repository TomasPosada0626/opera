import { useState } from 'react';
import { Hash, HandCoins, PackageOpen, Plus, Truck } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { DetailLink } from '../components/ui/DetailLink';
import { FilterChips } from '../components/ui/FilterChips';
import { KPICard } from '../components/ui/KPICard';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Pagination } from '../components/ui/Pagination';
import {
  PurchaseStatusBadge,
  SupplierPaymentBadge,
} from '../components/purchases/PurchaseBadges';
import { PurchaseOrderForm } from '../components/purchases/PurchaseOrderForm';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  usePayablesReport,
  usePurchaseOrders,
} from '../hooks/usePurchaseOrders';
import { getCurrentUser } from '../lib/current-user';
import { formatDate, formatMoney, formatMoneyCompact } from '../lib/format';
import { receivedRatio } from '../lib/purchase-status';
import type {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../types/purchase-order';

const PAGE_SIZE = 20;

type PurchaseFilter = PurchaseOrderStatus | 'ABIERTAS' | undefined;

function PurchaseOrdersPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<PurchaseFilter>(undefined);
  const [numberSearch, setNumberSearch] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const search = useDebouncedValue(numberSearch.trim(), 300);
  const navigate = useNavigate();
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const purchasesQuery = usePurchaseOrders({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    open: filter === 'ABIERTAS' || undefined,
    status: filter && filter !== 'ABIERTAS' ? filter : undefined,
  });
  const openQuery = usePurchaseOrders({ page: 1, pageSize: 1, open: true });
  const payablesQuery = usePayablesReport();
  const purchases = purchasesQuery.data?.data ?? [];

  const payableTotal = (payablesQuery.data ?? []).reduce(
    (sum, row) => sum + Number(row.balance),
    0,
  );
  const openCount = openQuery.data?.meta.total;

  function selectFilter(next: PurchaseFilter) {
    setFilter(next);
    setPage(1);
  }

  const columns: DataTableColumn<PurchaseOrder>[] = [
    {
      key: 'number',
      header: 'Compra',
      render: (order) => (
        <div className="flex flex-col">
          <span className="figures text-ink font-semibold">
            #{order.number}
          </span>
          <span className="text-ink-faint text-xs whitespace-nowrap">
            {formatDate(order.purchasedAt)}
          </span>
        </div>
      ),
    },
    {
      key: 'supplier',
      header: 'Proveedor',
      render: (order) => (
        <div className="flex max-w-60 flex-col">
          <span className="text-ink truncate font-medium">
            {order.supplier.name}
          </span>
          <span className="text-ink-faint truncate text-xs">
            {order.items.length === 1
              ? order.items[0].product.name
              : `${order.items.length} productos`}
            {order.supplierInvoice ? ` · Factura ${order.supplierInvoice}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (order) => <PurchaseStatusBadge status={order.status} />,
    },
    {
      key: 'received',
      header: 'Recibido',
      render: (order) => {
        const ratio = receivedRatio(order);
        return (
          <div className="flex w-24 flex-col gap-1">
            <div className="bg-chrome-strong h-1.5 overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  ratio >= 1 ? 'bg-success' : 'bg-accent'
                }`}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
            <span className="figures text-ink-faint text-[11px]">
              {Math.round(ratio * 100)}%
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
          {formatMoney(order.total)}
        </span>
      ),
    },
    {
      key: 'payment',
      header: 'Pago',
      render: (order) => (
        <div className="flex flex-col items-start gap-1">
          <SupplierPaymentBadge status={order.paymentStatus} />
          {Number(order.payable) > 0 && (
            <span className="figures text-danger text-xs whitespace-nowrap">
              Debe {formatMoney(order.payable)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'detail',
      header: '',
      className: 'w-10 text-right',
      render: (order) => (
        <DetailLink
          to={`/compras/${order.id}`}
          label={`Ver detalle de la compra ${order.number}`}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Comercial"
        title="Compras"
        description="Lo que se le pide a cada proveedor, lo que va llegando al inventario y lo que se le debe."
        actions={
          isAdmin && (
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus />
              Nueva compra
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KPICard
          icon={HandCoins}
          label="Por pagar"
          value={formatMoneyCompact(payableTotal)}
          title={formatMoney(payableTotal)}
          hint="De lo que ya llegó"
          variant={payableTotal > 0 ? 'danger' : 'neutral'}
          to="/reportes?vista=por-pagar"
        />
        <KPICard
          icon={PackageOpen}
          label="Por recibir"
          value={openCount ?? '—'}
          hint={
            openCount === 1
              ? 'compra con mercancía pendiente'
              : 'compras con mercancía pendiente'
          }
          variant="warning"
        />
        <KPICard
          icon={Truck}
          label="Proveedores con saldo"
          value={payablesQuery.data?.length ?? '—'}
          hint="a los que se les debe algo"
          variant="neutral"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips<PurchaseFilter>
          label="Filtrar compras"
          value={filter}
          onChange={selectFilter}
          options={[
            { value: undefined, label: 'Todas' },
            { value: 'ABIERTAS', label: 'Por recibir', count: openCount },
            { value: 'RECIBIDA', label: 'Recibidas' },
            { value: 'CERRADA', label: 'Cerradas' },
            { value: 'CANCELADA', label: 'Canceladas' },
          ]}
        />
        <div className="relative">
          <Hash className="text-ink-faint pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            type="search"
            inputMode="numeric"
            aria-label="Buscar compra por número"
            placeholder="N.º de compra"
            value={numberSearch}
            onChange={(event) => {
              setNumberSearch(event.target.value);
              setPage(1);
            }}
            className="field figures h-8 w-44 pr-3 pl-8"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={purchases}
        rowKey={(order) => order.id}
        isLoading={purchasesQuery.isLoading}
        emptyMessage="No hay compras registradas."
        emptyHint={
          isAdmin ? 'Registra la primera con "Nueva compra".' : undefined
        }
      />

      {purchasesQuery.data && (
        <Pagination
          page={purchasesQuery.data.meta.page}
          totalPages={purchasesQuery.data.meta.totalPages}
          onPageChange={setPage}
        />
      )}

      <p className="text-ink-faint text-xs">
        ¿Buscas el saldo con un proveedor en particular? Está en su ficha, en{' '}
        <Link to="/proveedores" className="text-accent hover:underline">
          Proveedores
        </Link>
        .
      </p>

      {isCreateModalOpen && (
        <Modal
          title="Nueva compra"
          description="El inventario no se mueve hasta que se recibe la mercancía."
          size="lg"
          onClose={() => setIsCreateModalOpen(false)}
        >
          <PurchaseOrderForm
            onSuccess={(order) => {
              setIsCreateModalOpen(false);
              void navigate(`/compras/${order.id}`);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

export default PurchaseOrdersPage;
