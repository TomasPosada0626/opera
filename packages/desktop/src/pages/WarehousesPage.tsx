import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { WarehouseForm } from '../components/warehouses/WarehouseForm';
import { WarehouseRowActions } from '../components/warehouses/WarehouseRowActions';
import { useWarehouses } from '../hooks/useWarehouses';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getCurrentUser } from '../lib/current-user';
import type { Warehouse } from '../types/inventory';

const PAGE_SIZE = 20;

function WarehousesPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(
    null,
  );
  const search = useDebouncedValue(searchInput, 300);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const warehousesQuery = useWarehouses({ page, pageSize: PAGE_SIZE, search });
  const warehouses = warehousesQuery.data?.data ?? [];

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  function openCreateModal() {
    setEditingWarehouse(null);
    setIsFormModalOpen(true);
  }

  function openEditModal(warehouse: Warehouse) {
    setEditingWarehouse(warehouse);
    setIsFormModalOpen(true);
  }

  function closeFormModal() {
    setIsFormModalOpen(false);
    setEditingWarehouse(null);
  }

  const columns: DataTableColumn<Warehouse>[] = [
    { key: 'name', header: 'Nombre', render: (warehouse) => warehouse.name },
    {
      key: 'location',
      header: 'Ubicación',
      render: (warehouse) => warehouse.location ?? '—',
    },
    {
      key: 'status',
      header: 'Estado',
      render: (warehouse) =>
        warehouse.isActive ? (
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
            render: (warehouse: Warehouse) => (
              <WarehouseRowActions
                warehouse={warehouse}
                onEdit={openEditModal}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-ink text-xl font-medium">Bodegas</h1>
          <p className="text-ink-muted mt-1 text-sm">
            Bodegas donde se almacena el inventario.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreateModal} className="shrink-0">
            <Plus className="h-4 w-4" />
            Nueva bodega
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
          aria-label="Buscar bodegas"
          className="border-line bg-surface-raised text-ink focus:border-accent focus:ring-accent/35 w-full rounded-md border py-2 pr-3 pl-9 text-sm outline-none focus:ring-2"
        />
      </div>

      <DataTable
        columns={columns}
        rows={warehouses}
        rowKey={(warehouse) => warehouse.id}
        isLoading={warehousesQuery.isLoading}
        emptyMessage="No se encontraron bodegas."
      />

      {warehousesQuery.data && (
        <Pagination
          page={warehousesQuery.data.meta.page}
          totalPages={warehousesQuery.data.meta.totalPages}
          onPageChange={setPage}
        />
      )}

      {isFormModalOpen && (
        <Modal
          title={editingWarehouse ? 'Editar bodega' : 'Nueva bodega'}
          onClose={closeFormModal}
        >
          <WarehouseForm
            warehouse={editingWarehouse ?? undefined}
            onSuccess={closeFormModal}
          />
        </Modal>
      )}
    </div>
  );
}

export default WarehousesPage;
