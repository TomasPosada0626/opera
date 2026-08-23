import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { ProductForm } from '../components/products/ProductForm';
import { ProductRowActions } from '../components/products/ProductRowActions';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useProducts } from '../hooks/useProducts';
import { getCurrentUser } from '../lib/current-user';
import { PRODUCT_TYPE_LABELS, type Product } from '../types/product';

const PAGE_SIZE = 20;

function ProductsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const search = useDebouncedValue(searchInput, 300);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const productsQuery = useProducts({ page, pageSize: PAGE_SIZE, search });
  const products = productsQuery.data?.data ?? [];

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  function openCreateModal() {
    setEditingProduct(null);
    setIsFormModalOpen(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setIsFormModalOpen(true);
  }

  function closeFormModal() {
    setIsFormModalOpen(false);
    setEditingProduct(null);
  }

  const columns: DataTableColumn<Product>[] = [
    {
      key: 'product',
      header: 'Producto',
      render: (product) => `${product.sku} — ${product.name}`,
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (product) => PRODUCT_TYPE_LABELS[product.type],
    },
    {
      key: 'category',
      header: 'Categoría',
      render: (product) => product.category.name,
    },
    {
      key: 'unit',
      header: 'Unidad',
      render: (product) => product.unit.abbreviation,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (product) =>
        product.isActive ? (
          <Badge variant="success">Activo</Badge>
        ) : (
          <Badge variant="danger">Inactivo</Badge>
        ),
    },
    ...(isAdmin
      ? [
          {
            key: 'action',
            header: '',
            className: 'text-right',
            render: (product: Product) => (
              <ProductRowActions product={product} onEdit={openEditModal} />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-ink text-xl font-medium">Productos</h1>
          <p className="text-ink-muted mt-1 text-sm">
            Catálogo de productos terminados, materias primas e insumos.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreateModal} className="shrink-0">
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Button>
        )}
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="text-ink-faint pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <input
          type="search"
          value={searchInput}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Buscar por nombre o SKU…"
          aria-label="Buscar productos"
          className="border-line bg-surface-raised text-ink focus:border-accent focus:ring-accent/35 w-full rounded-md border py-2 pr-3 pl-9 text-sm outline-none focus:ring-2"
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

      {isFormModalOpen && (
        <Modal
          title={editingProduct ? 'Editar producto' : 'Nuevo producto'}
          onClose={closeFormModal}
        >
          <ProductForm
            product={editingProduct ?? undefined}
            onSuccess={closeFormModal}
          />
        </Modal>
      )}
    </div>
  );
}

export default ProductsPage;
