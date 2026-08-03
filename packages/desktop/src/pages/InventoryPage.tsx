import { useState } from 'react';
import { Badge } from '../components/ui/Badge';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useProducts } from '../hooks/useProducts';
import { useStockSummary } from '../hooks/useStockSummary';
import type { Product } from '../types/product';

const PAGE_SIZE = 20;

const productTypeLabels: Record<Product['type'], string> = {
  FINISHED_GOOD: 'Producto terminado',
  RAW_MATERIAL: 'Materia prima',
  SUPPLY: 'Insumo',
};

function InventoryPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);

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
    { key: 'sku', header: 'SKU', render: (product) => product.sku },
    { key: 'name', header: 'Nombre', render: (product) => product.name },
    {
      key: 'type',
      header: 'Tipo',
      render: (product) => productTypeLabels[product.type],
    },
    {
      key: 'category',
      header: 'Categoría',
      render: (product) => product.category.name,
    },
    {
      key: 'stock',
      header: 'Stock actual',
      className: 'text-right tabular-nums',
      render: (product) => {
        const stock = stockByProduct.get(product.id);
        if (stock === undefined) {
          return <span className="text-ink-faint">—</span>;
        }

        const label = `${stock} ${product.unit.abbreviation}`;
        const isLowStock =
          product.minStock !== null && Number(stock) < Number(product.minStock);

        return isLowStock ? (
          <Badge variant="warning">{label}</Badge>
        ) : (
          <span>{label}</span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-ink text-xl font-medium">Inventario</h1>
        <p className="text-ink-muted mt-1 text-sm">
          Catálogo de productos y stock actual.
        </p>
      </div>

      <input
        type="search"
        value={searchInput}
        onChange={(event) => handleSearchChange(event.target.value)}
        placeholder="Buscar por nombre o SKU…"
        aria-label="Buscar productos"
        className="border-line bg-surface text-ink focus:border-accent w-full max-w-sm rounded-md border px-3 py-2 text-sm outline-none"
      />

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
    </div>
  );
}

export default InventoryPage;
