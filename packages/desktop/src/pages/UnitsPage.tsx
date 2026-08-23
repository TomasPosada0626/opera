import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { UnitForm } from '../components/units/UnitForm';
import { UnitRowActions } from '../components/units/UnitRowActions';
import { useUnits } from '../hooks/useUnits';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getCurrentUser } from '../lib/current-user';
import type { Unit } from '../types/product';

const PAGE_SIZE = 20;

function UnitsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const search = useDebouncedValue(searchInput, 300);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const unitsQuery = useUnits({ page, pageSize: PAGE_SIZE, search });
  const units = unitsQuery.data?.data ?? [];

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  function openCreateModal() {
    setEditingUnit(null);
    setIsFormModalOpen(true);
  }

  function openEditModal(unit: Unit) {
    setEditingUnit(unit);
    setIsFormModalOpen(true);
  }

  function closeFormModal() {
    setIsFormModalOpen(false);
    setEditingUnit(null);
  }

  const columns: DataTableColumn<Unit>[] = [
    { key: 'name', header: 'Nombre', render: (unit) => unit.name },
    {
      key: 'abbreviation',
      header: 'Abreviación',
      render: (unit) => unit.abbreviation,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (unit) =>
        unit.isActive ? (
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
            render: (unit: Unit) => (
              <UnitRowActions unit={unit} onEdit={openEditModal} />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-ink text-xl font-medium">Unidades</h1>
          <p className="text-ink-muted mt-1 text-sm">
            Unidades de medida del catálogo de productos.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreateModal} className="shrink-0">
            <Plus className="h-4 w-4" />
            Nueva unidad
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
          aria-label="Buscar unidades"
          className="border-line bg-surface-raised text-ink focus:border-accent focus:ring-accent/35 w-full rounded-md border py-2 pr-3 pl-9 text-sm outline-none focus:ring-2"
        />
      </div>

      <DataTable
        columns={columns}
        rows={units}
        rowKey={(unit) => unit.id}
        isLoading={unitsQuery.isLoading}
        emptyMessage="No se encontraron unidades."
      />

      {unitsQuery.data && (
        <Pagination
          page={unitsQuery.data.meta.page}
          totalPages={unitsQuery.data.meta.totalPages}
          onPageChange={setPage}
        />
      )}

      {isFormModalOpen && (
        <Modal
          title={editingUnit ? 'Editar unidad' : 'Nueva unidad'}
          onClose={closeFormModal}
        >
          <UnitForm
            unit={editingUnit ?? undefined}
            onSuccess={closeFormModal}
          />
        </Modal>
      )}
    </div>
  );
}

export default UnitsPage;
