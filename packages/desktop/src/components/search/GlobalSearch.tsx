import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useGlobalSearch } from '../../hooks/useGlobalSearch';
import { ORDER_STATUS_LABEL } from '../../lib/order-status';
import type { GlobalSearchResult } from '../../types/search';

const productionStatusLabel: Record<
  GlobalSearchResult['productionOrders'][number]['status'],
  string
> = {
  PENDIENTE: 'Pendiente',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
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
      label: 'Pedidos',
      items: data.orders.map((order) => ({
        key: order.id,
        label: `Pedido No. ${order.number} — ${order.customer.name}`,
        sublabel: ORDER_STATUS_LABEL[order.status],
        path: `/pedidos/${order.id}`,
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
    <div ref={containerRef} className="relative w-80">
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
          className="field h-9 w-full pr-3 pl-9"
        />
      </div>

      {showDropdown && (
        <div className="border-line bg-surface-raised animate-pop-in absolute top-full z-30 mt-1.5 max-h-[28rem] w-[26rem] overflow-y-auto rounded-xl border p-1 shadow-2xl shadow-black/15 dark:shadow-black/60">
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
              <p className="text-ink-faint px-3 pt-2 pb-1 text-[10.5px] font-semibold tracking-[0.14em] uppercase">
                {group.label}
              </p>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => goTo(item.path)}
                  className="hover:bg-accent-surface group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                >
                  <span className="text-ink group-hover:text-accent truncate">
                    {item.label}
                  </span>
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
