import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { CategoryForm } from '../components/categories/CategoryForm';
import { CategoryRowActions } from '../components/categories/CategoryRowActions';
import { useCategories } from '../hooks/useCategories';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getCurrentUser } from '../lib/current-user';
import type { Category } from '../types/product';

const PAGE_SIZE = 20;

function CategoriesPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const search = useDebouncedValue(searchInput, 300);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const categoriesQuery = useCategories({ page, pageSize: PAGE_SIZE, search });
  const categories = categoriesQuery.data?.data ?? [];

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  function openCreateModal() {
    setEditingCategory(null);
    setIsFormModalOpen(true);
  }

  function openEditModal(category: Category) {
    setEditingCategory(category);
    setIsFormModalOpen(true);
  }

  function closeFormModal() {
    setIsFormModalOpen(false);
    setEditingCategory(null);
  }

  const columns: DataTableColumn<Category>[] = [
    { key: 'name', header: 'Nombre', render: (category) => category.name },
    {
      key: 'status',
      header: 'Estado',
      render: (category) =>
        category.isActive ? (
          <Badge variant="success">Activa</Badge>
        ) : (
          <Badge variant="danger">Inactiva</Badge>
        ),
    },
    ...(isAdmin
      ? [
          {
            key: 'action',
            header: '',
            className: 'text-right',
            render: (category: Category) => (
              <CategoryRowActions category={category} onEdit={openEditModal} />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Catálogo"
        title="Categorías"
        description="Agrupan los productos del catálogo para buscarlos, filtrarlos y reportarlos."
        actions={
          isAdmin && (
            <Button onClick={openCreateModal}>
              <Plus />
              Nueva categoría
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
          placeholder="Buscar por nombre…"
          aria-label="Buscar categorías"
          className="field h-9 w-full pr-3 pl-9"
        />
      </div>

      <DataTable
        columns={columns}
        rows={categories}
        rowKey={(category) => category.id}
        isLoading={categoriesQuery.isLoading}
        emptyMessage="No se encontraron categorías."
      />

      {categoriesQuery.data && (
        <Pagination
          page={categoriesQuery.data.meta.page}
          totalPages={categoriesQuery.data.meta.totalPages}
          onPageChange={setPage}
        />
      )}

      {isFormModalOpen && (
        <Modal
          title={editingCategory ? 'Editar categoría' : 'Nueva categoría'}
          onClose={closeFormModal}
        >
          <CategoryForm
            category={editingCategory ?? undefined}
            onSuccess={closeFormModal}
          />
        </Modal>
      )}
    </div>
  );
}

export default CategoriesPage;
