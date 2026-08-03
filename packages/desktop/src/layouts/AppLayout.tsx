import { NavLink, Outlet, useNavigate } from 'react-router';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { UserMenu } from '../components/ui/UserMenu';
import { clearAuthToken } from '../lib/auth-token';
import { getCurrentUser } from '../lib/current-user';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  // Sin esto = visible para cualquier usuario autenticado. Ver #41: la
  // navegación debe reflejar los roles reales del usuario, no ser una
  // lista fija — hoy solo ADMIN existe, así que "Usuarios" es el único
  // ítem que de verdad demuestra el filtro funcionando.
  requiresRole?: string;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/inventario', label: 'Inventario' },
  { to: '/produccion', label: 'Producción' },
  { to: '/usuarios', label: 'Usuarios', requiresRole: 'ADMIN' },
];

function navLinkClassName(isActive: boolean): string {
  const base = 'rounded-md px-3 py-2 text-sm transition-colors';
  return isActive
    ? `${base} bg-accent text-on-accent`
    : `${base} text-ink-muted hover:text-ink hover:bg-surface-raised`;
}

// Shell autenticado: sidebar + topbar + menú de usuario. Distinto de
// RootLayout (que envuelve TODO, incluido /login) — este layout solo
// aplica a las rutas que ya pasaron el loader de sesión en router.tsx.
function AppLayout() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const visibleNavItems = navItems.filter(
    (item) => !item.requiresRole || user?.roles.includes(item.requiresRole),
  );

  function handleLogout() {
    clearAuthToken();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="border-line bg-chrome flex w-56 shrink-0 flex-col border-r p-4">
        <span className="text-ink mb-6 px-3 text-lg font-medium tracking-tight">
          Opera
        </span>
        <nav className="flex flex-col gap-1">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => navLinkClassName(isActive)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="border-line bg-chrome flex items-center justify-end gap-4 border-b px-6 py-3">
          <ThemeToggle />
          <UserMenu user={user} onLogout={handleLogout} />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
