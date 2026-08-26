import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useGlobalSearch } from '../../hooks/useGlobalSearch';
import type { GlobalSearchResult } from '../../types/search';

const productionStatusLabel: Record<
  GlobalSearchResult['productionOrders'][number]['status'],
  string
> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  COMPLETADA: 'Completada',
};

interface ResultGroup {
  label: string;
  items: { key: string; label: string; sublabel?: string; path: string }[];
}

// Salto rápido a UN registro por código/nombre/número (#77) — no reemplaza
// los filtros propios de cada listado (Productos/Clientes/Proveedores ya
// tienen el suyo). Producto y Orden de producción no tienen pantalla de
// detalle propia todavía, así que su resultado navega a la lista general
// en vez de a un detalle específico — degradación aceptada, documentada en
// el README, no un hueco a resolver acá.
function buildGroups(data: GlobalSearchResult | undefined): ResultGroup[] {
  if (!data) {
    return [];
  }
  const groups: ResultGroup[] = [
    {
      label: 'Productos',
      items: data.products.map((product) => ({
        key: product.id,
        label: `${product.sku} — ${product.name}`,
        path: '/productos',
      })),
    },
    {
      label: 'Clientes',
      items: data.customers.map((customer) => ({
        key: customer.id,
        label: customer.name,
        path: `/clientes/${customer.id}`,
      })),
    },
    {
      label: 'Proveedores',
      items: data.suppliers.map((supplier) => ({
        key: supplier.id,
        label: supplier.name,
        path: `/proveedores/${supplier.id}`,
      })),
    },
    {
      label: 'Remisiones',
      items: data.remissions.map((remission) => ({
        key: remission.id,
        label: `Remisión No. ${remission.number}`,
        path: `/pedidos/${remission.orderId}`,
      })),
    },
    {
      label: 'Órdenes de producción',
      items: data.productionOrders.map((order) => ({
        key: order.id,
        label: `${order.product.sku} — ${order.product.name}`,
        sublabel: productionStatusLabel[order.status],
        path: '/produccion',
      })),
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}

export function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const debouncedTerm = useDebouncedValue(term, 300);
  const searchQuery = useGlobalSearch(debouncedTerm);
  const groups = buildGroups(searchQuery.data);
  const showDropdown = isOpen && debouncedTerm.trim().length >= 2;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function goTo(path: string) {
    void navigate(path);
    setIsOpen(false);
    setTerm('');
  }

  return (
    <div ref={containerRef} className="relative w-72">
      <div className="relative">
        <Search className="text-ink-faint pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <input
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setIsOpen(false);
            }
          }}
          placeholder="Buscar productos, clientes, remisiones…"
          className="border-line bg-surface text-ink placeholder:text-ink-faint focus:border-accent focus:ring-accent/35 w-full rounded-md border py-1.5 pr-3 pl-9 text-sm outline-none focus:ring-2"
        />
      </div>

      {showDropdown && (
        <div className="border-line bg-surface-raised absolute top-full z-10 mt-1 max-h-96 w-full overflow-y-auto rounded-md border shadow-md shadow-black/[0.06] dark:shadow-black/50">
          {searchQuery.isLoading && (
            <p className="text-ink-muted px-3 py-3 text-sm">Buscando…</p>
          )}
          {!searchQuery.isLoading && groups.length === 0 && (
            <p className="text-ink-muted px-3 py-3 text-sm">
              Sin resultados para &quot;{debouncedTerm}&quot;.
            </p>
          )}
          {groups.map((group) => (
            <div key={group.label} className="py-1">
              <p className="text-ink-faint px-3 pt-1.5 pb-1 text-xs font-medium tracking-wide uppercase">
                {group.label}
              </p>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => goTo(item.path)}
                  className="hover:bg-chrome-strong flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm"
                >
                  <span className="text-ink truncate">{item.label}</span>
                  {item.sublabel && (
                    <span className="text-ink-muted shrink-0 text-xs">
                      {item.sublabel}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
