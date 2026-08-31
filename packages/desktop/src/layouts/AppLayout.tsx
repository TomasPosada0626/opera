import { Suspense, useState, type ComponentType } from 'react';
import {
  LayoutDashboard,
  Package,
  Factory,
  ShoppingCart,
  Boxes,
  Tag,
  Ruler,
  Warehouse,
  Contact,
  Truck,
  BarChart3,
  Users,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { GlobalSearch } from '../components/search/GlobalSearch';
import { Logo } from '../components/ui/Logo';
import { PageFallback } from '../components/ui/PageFallback';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { UserMenu } from '../components/ui/UserMenu';
import { clearAuthToken } from '../lib/auth-token';
import { getCurrentUser } from '../lib/current-user';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
  // Sin esto = visible para cualquier usuario autenticado. Ver #41: la
  // navegación debe reflejar los roles reales del usuario, no ser una
  // lista fija — hoy solo ADMIN existe, así que "Usuarios" es el único
  // ítem que de verdad demuestra el filtro funcionando.
  requiresRole?: string;
}

// Submenú plegable — reversa deliberada de la decisión de #95 ("4 ítems
// sueltos, un submenú no valía la pena"): tenía sentido con ~8 ítems en el
// sidebar; con los 12 que dejó M5 (Clientes/Proveedores/Reportes/Usuarios),
// Catálogo (setup que se toca poco) se agrupa para que el sidebar vuelva a
// leerse como "flujos de trabajo" en vez de una lista plana de recursos.
interface NavGroup {
  label: string;
  icon: ComponentType<{ className?: string }>;
  children: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

const navEntries: NavEntry[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/inventario', label: 'Inventario', icon: Package },
  { to: '/produccion', label: 'Producción', icon: Factory },
  { to: '/pedidos', label: 'Pedidos', icon: ShoppingCart },
  {
    label: 'Catálogo',
    icon: Boxes,
    children: [
      { to: '/productos', label: 'Productos', icon: Boxes },
      { to: '/categorias', label: 'Categorías', icon: Tag },
      { to: '/unidades', label: 'Unidades', icon: Ruler },
      { to: '/bodegas', label: 'Bodegas', icon: Warehouse },
    ],
  },
  { to: '/clientes', label: 'Clientes', icon: Contact },
  { to: '/proveedores', label: 'Proveedores', icon: Truck },
  { to: '/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/usuarios', label: 'Usuarios', icon: Users, requiresRole: 'ADMIN' },
];

// El acento sólido queda para un botón primario por pantalla — el ítem
// activo del menú usa un fondo tenue + texto de acento, no un bloque
// azul sólido (ver ajuste de diseño post-#46).
function navLinkClassName(isActive: boolean): string {
  const base =
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chrome';
  return isActive
    ? `${base} bg-accent-surface text-accent font-medium`
    : `${base} text-ink-muted hover:text-ink hover:bg-chrome-strong`;
}

function isVisible(item: NavItem, user: { roles: string[] } | null): boolean {
  return (
    !item.requiresRole || (user?.roles.includes(item.requiresRole) ?? false)
  );
}

// Shell autenticado: sidebar + topbar + menú de usuario. Distinto de
// RootLayout (que envuelve TODO, incluido /login) — este layout solo
// aplica a las rutas que ya pasaron el loader de sesión en router.tsx.
function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  const visibleEntries = navEntries
    .map((entry) =>
      isNavGroup(entry)
        ? {
            ...entry,
            children: entry.children.filter((child) => isVisible(child, user)),
          }
        : entry,
    )
    .filter((entry) =>
      isNavGroup(entry) ? entry.children.length > 0 : isVisible(entry, user),
    );

  // Un grupo con la ruta actual entre sus hijos arranca expandido — si no,
  // aterrizar en /productos (ej. desde un enlace externo o un refresh) lo
  // escondería dentro de un submenú cerrado.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const entry of navEntries) {
      if (
        isNavGroup(entry) &&
        entry.children.some((child) => location.pathname.startsWith(child.to))
      ) {
        initial.add(entry.label);
      }
    }
    return initial;
  });

  function toggleGroup(label: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  function handleLogout() {
    clearAuthToken();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="bg-surface flex min-h-screen">
      <aside className="border-line bg-chrome flex w-60 shrink-0 flex-col border-r">
        <div className="border-line border-b px-5 py-5">
          <div className="flex items-center gap-2.5">
            <Logo size={24} />
            <span className="text-ink text-lg font-medium tracking-tight">
              Opera
            </span>
          </div>
          <p className="text-ink-faint mt-0.5 text-xs">Gestión operativa</p>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {visibleEntries.map((entry) =>
            isNavGroup(entry) ? (
              <div key={entry.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.label)}
                  aria-expanded={expandedGroups.has(entry.label)}
                  className="text-ink-muted hover:text-ink hover:bg-chrome-strong focus-visible:ring-accent focus-visible:ring-offset-chrome flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  <entry.icon className="h-4.5 w-4.5 shrink-0" />
                  <span className="flex-1 text-left">{entry.label}</span>
                  {expandedGroups.has(entry.label) ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                </button>
                {expandedGroups.has(entry.label) && (
                  <div className="mt-1 flex flex-col gap-1 pl-4">
                    {entry.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        end={child.end}
                        className={({ isActive }) => navLinkClassName(isActive)}
                      >
                        <child.icon className="h-4.5 w-4.5 shrink-0" />
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink
                key={entry.to}
                to={entry.to}
                end={entry.end}
                className={({ isActive }) => navLinkClassName(isActive)}
              >
                <entry.icon className="h-4.5 w-4.5 shrink-0" />
                {entry.label}
              </NavLink>
            ),
          )}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="border-line bg-chrome flex items-center justify-between gap-4 border-b px-6 py-3">
          <GlobalSearch />
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <UserMenu user={user} onLogout={handleLogout} />
          </div>
        </header>
        <main className="flex-1 p-8">
          <div className="mx-auto max-w-6xl">
            <ErrorBoundary variant="inline" key={location.pathname}>
              {/* Un solo límite de Suspense para todas las rutas hijas
                  (#21, auditoría) -- cada página está code-split con
                  React.lazy (ver router.tsx), así que no hace falta
                  envolver cada <Route> por separado. */}
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
