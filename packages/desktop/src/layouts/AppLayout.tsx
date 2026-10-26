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
  PackagePlus,
  Truck,
  BarChart3,
  Users,
  ChevronDown,
  ScrollText,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { RecoveryCodeBanner } from '../components/auth/RecoveryCodeBanner';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { GlobalSearch } from '../components/search/GlobalSearch';
import { Logo } from '../components/ui/Logo';
import { PageFallback } from '../components/ui/PageFallback';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { UserMenu } from '../components/ui/UserMenu';
import { clearAuthToken } from '../lib/auth-token';
import { getCurrentUser } from '../lib/current-user';
import { useHasSeveralWarehouses } from '../hooks/useWarehouses';

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
  // Solo con más de una bodega: en una sola fábrica (Herrajes Toro) no hay
  // nada que administrar ahí.
  requiresSeveralWarehouses?: boolean;
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

// Secciones por flujo de trabajo, en el orden en que la dueña recorre el
// día: lo que está pasando (General), lo que se fabrica y se despacha
// (Operación), con quién se trabaja (Comercial) y lo que se configura una
// vez (Configuración).
interface NavSection {
  label?: string;
  entries: NavEntry[];
}

const navSections: NavSection[] = [
  {
    entries: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/reportes', label: 'Reportes', icon: BarChart3 },
    ],
  },
  {
    label: 'Operación',
    entries: [
      { to: '/pedidos', label: 'Pedidos', icon: ShoppingCart },
      { to: '/produccion', label: 'Producción', icon: Factory },
      { to: '/inventario', label: 'Inventario', icon: Package },
    ],
  },
  {
    label: 'Comercial',
    entries: [
      { to: '/clientes', label: 'Clientes', icon: Contact },
      { to: '/proveedores', label: 'Proveedores', icon: Truck },
      { to: '/compras', label: 'Compras', icon: PackagePlus },
    ],
  },
  {
    label: 'Configuración',
    entries: [
      {
        label: 'Catálogo',
        icon: Boxes,
        children: [
          { to: '/productos', label: 'Productos', icon: Boxes },
          { to: '/categorias', label: 'Categorías', icon: Tag },
          { to: '/unidades', label: 'Unidades', icon: Ruler },
          {
            to: '/bodegas',
            label: 'Bodegas',
            icon: Warehouse,
            requiresSeveralWarehouses: true,
          },
        ],
      },
      {
        to: '/usuarios',
        label: 'Usuarios',
        icon: Users,
        requiresRole: 'ADMIN',
      },
      {
        to: '/auditoria',
        label: 'Auditoría',
        icon: ScrollText,
        requiresRole: 'ADMIN',
      },
    ],
  },
];

// El acento sólido queda para un botón primario por pantalla — el ítem
// activo del menú usa un fondo tenue + texto de acento, no un bloque
// azul sólido (ver ajuste de diseño post-#46). La barrita a la izquierda
// marca el activo aunque el fondo tenue se pierda con poco brillo.
function navLinkClassName(isActive: boolean): string {
  const base =
    'group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chrome';
  return isActive
    ? `${base} bg-accent-surface text-accent font-medium before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-accent`
    : `${base} text-ink-muted hover:text-ink hover:bg-chrome-strong`;
}

function isVisible(
  item: NavItem,
  user: { roles: string[] } | null,
  hasSeveralWarehouses: boolean,
): boolean {
  if (item.requiresSeveralWarehouses && !hasSeveralWarehouses) {
    return false;
  }
  return (
    !item.requiresRole || (user?.roles.includes(item.requiresRole) ?? false)
  );
}

// Shell autenticado: sidebar + topbar + menú de usuario. Distinto de
// RootLayout (que envuelve TODO, incluido /login) — este layout solo
// aplica a las rutas que ya pasaron el loader de sesión en router.tsx.
// El sidebar queda fijo (sticky, alto completo) y solo el contenido hace
// scroll: en listados largos el menú siempre está a mano.
function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  const hasSeveralWarehouses = useHasSeveralWarehouses();
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      entries: section.entries
        .map((entry) =>
          isNavGroup(entry)
            ? {
                ...entry,
                children: entry.children.filter((child) =>
                  isVisible(child, user, hasSeveralWarehouses),
                ),
              }
            : entry,
        )
        .filter((entry) =>
          isNavGroup(entry)
            ? entry.children.length > 0
            : isVisible(entry, user, hasSeveralWarehouses),
        ),
    }))
    .filter((section) => section.entries.length > 0);

  // Un grupo con la ruta actual entre sus hijos arranca expandido — si no,
  // aterrizar en /productos (ej. desde un enlace externo o un refresh) lo
  // escondería dentro de un submenú cerrado.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const section of navSections) {
      for (const entry of section.entries) {
        if (
          isNavGroup(entry) &&
          entry.children.some((child) => location.pathname.startsWith(child.to))
        ) {
          initial.add(entry.label);
        }
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
      <aside className="border-line bg-chrome sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r">
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <Logo size={28} />
          <div className="flex flex-col">
            <span className="text-ink text-[15px] leading-none font-medium tracking-[0.32em]">
              OPERA
            </span>
            <span className="text-ink-faint mt-1.5 text-[11px] leading-none">
              Gestión operativa
            </span>
          </div>
        </div>
        <nav
          aria-label="Principal"
          className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-6"
        >
          {visibleSections.map((section, index) => (
            <div key={section.label ?? index} className="flex flex-col gap-0.5">
              {section.label && (
                <p className="text-ink-faint px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.14em] uppercase">
                  {section.label}
                </p>
              )}
              {section.entries.map((entry) =>
                isNavGroup(entry) ? (
                  <div key={entry.label}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(entry.label)}
                      aria-expanded={expandedGroups.has(entry.label)}
                      className="text-ink-muted hover:text-ink hover:bg-chrome-strong focus-visible:ring-accent focus-visible:ring-offset-chrome flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13.5px] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    >
                      <entry.icon className="h-4.5 w-4.5 shrink-0" />
                      <span className="flex-1 text-left">{entry.label}</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                          expandedGroups.has(entry.label) ? '' : '-rotate-90'
                        }`}
                      />
                    </button>
                    {expandedGroups.has(entry.label) && (
                      <div className="border-line animate-fade-in mt-0.5 ml-[21px] flex flex-col gap-0.5 border-l pl-3">
                        {entry.children.map((child) => (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            end={child.end}
                            className={({ isActive }) =>
                              navLinkClassName(isActive)
                            }
                          >
                            <child.icon className="h-4 w-4 shrink-0" />
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
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-line bg-surface/80 sticky top-0 z-20 flex h-15 items-center justify-between gap-4 border-b px-8 backdrop-blur-md">
          <GlobalSearch />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <UserMenu user={user} onLogout={handleLogout} />
          </div>
        </header>
        <main className="flex-1 px-8 pt-8 pb-16">
          <div
            className="animate-fade-in mx-auto max-w-6xl"
            key={location.pathname}
          >
            <RecoveryCodeBanner />
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
