import { useState } from 'react';
import { Package, Search } from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useProducts } from '../../hooks/useProducts';
import type { Product } from '../../types/product';

interface ProductPickerProps {
  value: Product | null;
  onChange: (product: Product | null) => void;
  error?: string;
}

// "(Roble, Natural, Grande)" — solo los atributos que el producto tiene,
// para distinguir variantes del mismo nombre base (ej. dos sillas, una en
// roble y otra en pino) al armar un pedido rápido.
function attributesLabel(product: Product): string {
  const attributes = [product.finish, product.material, product.size].filter(
    (value): value is string => !!value,
  );
  return attributes.length > 0 ? ` (${attributes.join(', ')})` : '';
}

// Buscador simple en vez de un <select> con todo el catálogo: con más de
// unas pocas decenas de productos un <select> plano deja de ser usable.
export function ProductPicker({ value, onChange, error }: ProductPickerProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const productsQuery = useProducts({
    page: 1,
    pageSize: 10,
    search: debouncedSearch,
  });
  const showResults = search.length > 0;

  if (value) {
    return (
      <div className="border-line bg-surface flex items-center justify-between rounded-md border px-3 py-2 text-sm">
        <span className="text-ink flex items-center gap-2">
          <Package className="text-ink-faint h-4 w-4 shrink-0" />
          {value.sku} — {value.name}
          {attributesLabel(value)}
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
        placeholder="Buscar producto por nombre o SKU…"
        aria-label="Buscar producto"
        aria-invalid={!!error}
        className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 aria-invalid:border-danger aria-invalid:focus:ring-danger/35 w-full rounded-md border py-2 pr-3 pl-9 text-sm outline-none focus:ring-2"
      />
      {showResults && (
        <ul className="border-line bg-surface-raised absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border shadow-lg">
          {productsQuery.data && productsQuery.data.data.length === 0 ? (
            <li className="text-ink-muted px-3 py-2 text-sm">
              Sin resultados.
            </li>
          ) : (
            productsQuery.data?.data.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(product);
                    setSearch('');
                  }}
                  className="hover:bg-chrome text-ink w-full px-3 py-2 text-left text-sm"
                >
                  {product.sku} — {product.name}
                  {attributesLabel(product)}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {error && <p className="text-danger mt-1 text-xs">{error}</p>}
    </div>
  );
}
