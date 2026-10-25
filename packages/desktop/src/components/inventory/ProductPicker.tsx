import { useState } from 'react';
import { Package, Search } from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useProducts } from '../../hooks/useProducts';
import type { Product } from '../../types/product';

interface ProductPickerProps {
  value: Product | null;
  onChange: (product: Product | null) => void;
  error?: string;
  // Restringe los resultados (p. ej. solo materias primas e insumos en la
  // lista de materiales) — se filtra en el cliente sobre la página de
  // resultados de la búsqueda.
  filter?: (product: Product) => boolean;
  ariaLabel?: string;
  placeholder?: string;
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
export function ProductPicker({
  value,
  onChange,
  error,
  filter,
  ariaLabel = 'Buscar producto',
  placeholder = 'Buscar producto por nombre o SKU…',
}: ProductPickerProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const productsQuery = useProducts({
    page: 1,
    pageSize: 10,
    search: debouncedSearch,
  });
  const showResults = search.length > 0;
  const results = (productsQuery.data?.data ?? []).filter(
    (product) => !filter || filter(product),
  );

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
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={!!error}
        className="field w-full py-2 pr-3 pl-9"
      />
      {showResults && (
        <ul className="border-line bg-surface-raised animate-pop-in absolute z-10 mt-1.5 max-h-60 w-full overflow-y-auto rounded-xl border p-1 shadow-xl shadow-black/10 dark:shadow-black/50">
          {productsQuery.data && results.length === 0 ? (
            <li className="text-ink-muted px-3 py-2 text-sm">
              Sin resultados.
            </li>
          ) : (
            results.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(product);
                    setSearch('');
                  }}
                  className="hover:bg-accent-surface hover:text-accent text-ink w-full rounded-lg px-3 py-2 text-left text-sm transition-colors"
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
