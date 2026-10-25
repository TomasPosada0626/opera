import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import {
  PartyContactCell,
  PartyDetailLink,
  PartyNameCell,
} from '../components/ui/PartyCells';
import { PageHeader } from '../components/ui/PageHeader';
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
    {
      key: 'name',
      header: 'Nombre',
      render: (supplier) => (
        <PartyNameCell party={supplier} to={`/proveedores/${supplier.id}`} />
      ),
    },
    {
      key: 'contact',
      header: 'Contacto',
      render: (supplier) => <PartyContactCell party={supplier} />,
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
            className: 'text-right whitespace-nowrap',
            render: (supplier: Supplier) => (
              <SupplierRowActions supplier={supplier} onEdit={openEditModal} />
            ),
          },
        ]
      : []),
    {
      key: 'detail',
      header: '',
      className: 'w-10 text-right',
      render: (supplier) => (
        <PartyDetailLink
          name={supplier.name}
          to={`/proveedores/${supplier.id}`}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Comercial"
        title="Proveedores"
        description="A quién le compras, a qué precio por producto, y el historial de compras recibidas."
        actions={
          isAdmin && (
            <Button onClick={openCreateModal}>
              <Plus />
              Nuevo proveedor
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
          aria-label="Buscar proveedores"
          className="field h-9 w-full pr-3 pl-9"
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
