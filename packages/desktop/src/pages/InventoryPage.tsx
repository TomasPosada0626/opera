import { useState } from 'react';
import { Notebook, Plus, Search } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '../components/ui/Badge';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { MovementForm } from '../components/inventory/MovementForm';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useProducts } from '../hooks/useProducts';
import { useStockSummary } from '../hooks/useStockSummary';
import { getCurrentUser } from '../lib/current-user';
import { formatQuantity } from '../lib/format';
import { PRODUCT_TYPE_LABELS } from '../types/product';
import type { Product } from '../types/product';

const PAGE_SIZE = 20;

function InventoryPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const search = useDebouncedValue(searchInput, 300);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const productsQuery = useProducts({ page, pageSize: PAGE_SIZE, search });
  const products = productsQuery.data?.data ?? [];

  const stockQuery = useStockSummary(products.map((product) => product.id));
  const stockByProduct = new Map(
    (stockQuery.data ?? []).map((entry) => [entry.productId, entry.stock]),
  );

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  const columns: DataTableColumn<Product>[] = [
    {
      key: 'name',
      header: 'Producto',
      render: (product) => (
        <div className="flex flex-col">
          <span className="text-ink font-medium">{product.name}</span>
          <span className="code text-ink-faint text-xs">{product.sku}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      className: 'whitespace-nowrap',
      render: (product) => (
        <span className="text-ink-secondary">
          {PRODUCT_TYPE_LABELS[product.type]}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Categoría',
      render: (product) => (
        <span className="text-ink-secondary">{product.category.name}</span>
      ),
    },
    {
      key: 'minStock',
      header: 'Mínimo',
      className: 'text-right figures whitespace-nowrap',
      render: (product) =>
        product.minStock === null ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <span className="text-ink-muted">
            {formatQuantity(product.minStock)} {product.unit.abbreviation}
          </span>
        ),
    },
    {
      key: 'stock',
      header: 'Stock actual',
      className: 'text-right figures whitespace-nowrap',
      render: (product) => {
        const stock = stockByProduct.get(product.id);
        if (stock === undefined) {
          return <span className="text-ink-faint">—</span>;
        }

        const label = `${formatQuantity(stock)} ${product.unit.abbreviation}`;
        const isLowStock =
          product.minStock !== null && Number(stock) < Number(product.minStock);

        return isLowStock ? (
          <Badge variant="warning">{label}</Badge>
        ) : (
          <span className="text-ink font-medium">{label}</span>
        );
      },
    },
    {
      key: 'kardex',
      header: '',
      className: 'text-right',
      render: (product) => (
        <Link
          to={`/inventario/${product.id}/kardex`}
          className="text-ink-muted hover:text-ink hover:bg-chrome-strong inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors"
        >
          <Notebook className="h-4 w-4" />
          Kardex
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operación"
        title="Inventario"
        description="Stock actual por producto, calculado del Kardex. Cada entrada, salida o ajuste queda registrado con su motivo y no se puede borrar."
        actions={
          isAdmin && (
            <Button onClick={() => setIsMovementModalOpen(true)}>
              <Plus />
              Nuevo movimiento
            </Button>
          )
        }
      />

      <div className="relative w-full max-w-sm">
        <Search className="text-ink-faint pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <input
          type="search"
          value={searchInput}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Buscar por nombre o SKU…"
          aria-label="Buscar productos"
          className="field h-9 w-full pr-3 pl-9"
        />
      </div>

      <DataTable
        columns={columns}
        rows={products}
        rowKey={(product) => product.id}
        isLoading={productsQuery.isLoading}
        emptyMessage="No se encontraron productos."
      />

      {productsQuery.data && (
        <Pagination
          page={productsQuery.data.meta.page}
          totalPages={productsQuery.data.meta.totalPages}
          onPageChange={setPage}
        />
      )}

      {isMovementModalOpen && (
        <Modal
          title="Nuevo movimiento de inventario"
          onClose={() => setIsMovementModalOpen(false)}
        >
          <MovementForm onSuccess={() => setIsMovementModalOpen(false)} />
        </Modal>
      )}
    </div>
  );
}

export default InventoryPage;
