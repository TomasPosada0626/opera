import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { SupplierForm } from '../components/suppliers/SupplierForm';
import { SupplierRowActions } from '../components/suppliers/SupplierRowActions';
import { useSuppliers } from '../hooks/useSuppliers';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getCurrentUser } from '../lib/current-user';
import type { Supplier } from '../types/supplier';

const PAGE_SIZE = 20;

function SuppliersPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const search = useDebouncedValue(searchInput, 300);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const suppliersQuery = useSuppliers({ page, pageSize: PAGE_SIZE, search });
  const suppliers = suppliersQuery.data?.data ?? [];

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  function openCreateModal() {
    setEditingSupplier(null);
    setIsFormModalOpen(true);
  }

  function openEditModal(supplier: Supplier) {
    setEditingSupplier(supplier);
    setIsFormModalOpen(true);
  }

  function closeFormModal() {
    setIsFormModalOpen(false);
    setEditingSupplier(null);
  }

  const columns: DataTableColumn<Supplier>[] = [
    { key: 'name', header: 'Nombre', render: (supplier) => supplier.name },
    {
      key: 'taxId',
      header: 'NIT',
      render: (supplier) => supplier.taxId ?? '—',
    },
    {
      key: 'email',
      header: 'Correo',
      render: (supplier) => supplier.email ?? '—',
    },
    {
      key: 'phone',
      header: 'Teléfono',
      render: (supplier) => supplier.phone ?? '—',
    },
    {
      key: 'status',
      header: 'Estado',
      render: (supplier) =>
        supplier.isActive ? (
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
            render: (supplier: Supplier) => (
              <SupplierRowActions supplier={supplier} onEdit={openEditModal} />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-ink text-xl font-medium">Proveedores</h1>
          <p className="text-ink-muted mt-1 text-sm">
            Proveedores registrados y su información de contacto.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreateModal} className="shrink-0">
            <Plus className="h-4 w-4" />
            Nuevo proveedor
          </Button>
        )}
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="text-ink-faint pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <input
          type="search"
          value={searchInput}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Buscar por nombre…"
          aria-label="Buscar proveedores"
          className="border-line bg-surface-raised text-ink focus:border-accent focus:ring-accent/35 w-full rounded-md border py-2 pr-3 pl-9 text-sm outline-none focus:ring-2"
        />
      </div>

      <DataTable
        columns={columns}
        rows={suppliers}
        rowKey={(supplier) => supplier.id}
        isLoading={suppliersQuery.isLoading}
        emptyMessage="No se encontraron proveedores."
      />

      {suppliersQuery.data && (
        <Pagination
          page={suppliersQuery.data.meta.page}
          totalPages={suppliersQuery.data.meta.totalPages}
          onPageChange={setPage}
        />
      )}

      {isFormModalOpen && (
        <Modal
          title={editingSupplier ? 'Editar proveedor' : 'Nuevo proveedor'}
          onClose={closeFormModal}
        >
          <SupplierForm
            supplier={editingSupplier ?? undefined}
            onSuccess={closeFormModal}
          />
        </Modal>
      )}
    </div>
  );
}

export default SuppliersPage;
