import { useState } from 'react';
import { Plus, Search, User } from 'lucide-react';
import { useCreateCustomer } from '../../hooks/useCreateCustomer';
import { useCustomers } from '../../hooks/useCustomers';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { Customer } from '../../types/customer';

interface CustomerPickerProps {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  error?: string;
}

// Buscador por nombre, mismo espíritu que ProductPicker — pero cuando no
// hay resultados para lo escrito ofrece crear el cliente al vuelo con solo
// el nombre (el resto de datos se completa después desde Clientes).
export function CustomerPicker({
  value,
  onChange,
  error,
}: CustomerPickerProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const customersQuery = useCustomers({
    page: 1,
    pageSize: 10,
    search: debouncedSearch,
  });
  const createCustomer = useCreateCustomer();
  const showResults = search.length > 0;
  const results = customersQuery.data?.data ?? [];

  function handleCreate() {
    const name = search.trim();
    if (!name) {
      return;
    }
    createCustomer.mutate(
      { name },
      {
        onSuccess: (customer) => {
          onChange(customer);
          setSearch('');
        },
      },
    );
  }

  if (value) {
    return (
      <div className="border-line bg-surface flex items-center justify-between rounded-md border px-3 py-2 text-sm">
        <span className="text-ink flex items-center gap-2">
          <User className="text-ink-faint h-4 w-4 shrink-0" />
          {value.name}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-ink-muted hover:text-ink text-xs font-medium"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="text-ink-faint pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
      <input
        type="text"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar cliente por nombre…"
        aria-label="Buscar cliente"
        aria-invalid={!!error}
        className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 aria-invalid:border-danger aria-invalid:focus:ring-danger/35 w-full rounded-md border py-2 pr-3 pl-9 text-sm outline-none focus:ring-2"
      />
      {showResults && (
        <ul className="border-line bg-surface-raised absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border shadow-lg">
          {results.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(customer);
                  setSearch('');
                }}
                className="hover:bg-chrome text-ink w-full px-3 py-2 text-left text-sm"
              >
                {customer.name}
              </button>
            </li>
          ))}
          {!customersQuery.isLoading && (
            <li>
              <button
                type="button"
                onClick={handleCreate}
                disabled={createCustomer.isPending}
                className="hover:bg-chrome text-accent flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm disabled:opacity-50"
              >
                <Plus className="h-4 w-4 shrink-0" />
                {createCustomer.isPending
                  ? 'Creando…'
                  : `Crear cliente "${search.trim()}"`}
              </button>
            </li>
          )}
        </ul>
      )}
      {createCustomer.isError && (
        <p className="text-danger mt-1 text-xs">
          No se pudo crear el cliente. Intenta de nuevo.
        </p>
      )}
      {error && <p className="text-danger mt-1 text-xs">{error}</p>}
    </div>
  );
}
