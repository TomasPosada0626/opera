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
import { CustomerForm } from '../components/customers/CustomerForm';
import { CustomerRowActions } from '../components/customers/CustomerRowActions';
import { useCustomers } from '../hooks/useCustomers';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getCurrentUser } from '../lib/current-user';
import type { Customer } from '../types/customer';

const PAGE_SIZE = 20;

function CustomersPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const search = useDebouncedValue(searchInput, 300);
  const isAdmin = getCurrentUser()?.roles.includes('ADMIN') ?? false;

  const customersQuery = useCustomers({ page, pageSize: PAGE_SIZE, search });
  const customers = customersQuery.data?.data ?? [];

  function handleSearchChange(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  function openCreateModal() {
    setEditingCustomer(null);
    setIsFormModalOpen(true);
  }

  function openEditModal(customer: Customer) {
    setEditingCustomer(customer);
    setIsFormModalOpen(true);
  }

  function closeFormModal() {
    setIsFormModalOpen(false);
    setEditingCustomer(null);
  }

  const columns: DataTableColumn<Customer>[] = [
    {
      key: 'name',
      header: 'Nombre',
      render: (customer) => (
        <PartyNameCell party={customer} to={`/clientes/${customer.id}`} />
      ),
    },
    {
      key: 'contact',
      header: 'Contacto',
      render: (customer) => <PartyContactCell party={customer} />,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (customer) =>
        customer.isActive ? (
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
            render: (customer: Customer) => (
              <CustomerRowActions customer={customer} onEdit={openEditModal} />
            ),
          },
        ]
      : []),
    {
      key: 'detail',
      header: '',
      className: 'w-10 text-right',
      render: (customer) => (
        <PartyDetailLink name={customer.name} to={`/clientes/${customer.id}`} />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Comercial"
        title="Clientes"
        description="Quién te compra: datos de contacto y, en el detalle de cada uno, sus pedidos, abonos y saldo pendiente."
        actions={
          isAdmin && (
            <Button onClick={openCreateModal}>
              <Plus />
              Nuevo cliente
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
          aria-label="Buscar clientes"
          className="field h-9 w-full pr-3 pl-9"
        />
      </div>

      <DataTable
        columns={columns}
        rows={customers}
        rowKey={(customer) => customer.id}
        isLoading={customersQuery.isLoading}
        emptyMessage="No se encontraron clientes."
      />

      {customersQuery.data && (
        <Pagination
          page={customersQuery.data.meta.page}
          totalPages={customersQuery.data.meta.totalPages}
          onPageChange={setPage}
        />
      )}

      {isFormModalOpen && (
        <Modal
          title={editingCustomer ? 'Editar cliente' : 'Nuevo cliente'}
          onClose={closeFormModal}
        >
          <CustomerForm
            customer={editingCustomer ?? undefined}
            onSuccess={closeFormModal}
          />
        </Modal>
      )}
    </div>
  );
}

export default CustomersPage;
