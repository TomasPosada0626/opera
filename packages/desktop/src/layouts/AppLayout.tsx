import type { ComponentType } from 'react';
import { LayoutDashboard, Package, Factory, Users } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Logo } from '../components/ui/Logo';
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

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/inventario', label: 'Inventario', icon: Package },
  { to: '/produccion', label: 'Producción', icon: Factory },
  { to: '/usuarios', label: 'Usuarios', icon: Users, requiresRole: 'ADMIN' },
];

// El acento sólido queda para un botón primario por pantalla — el ítem
// activo del menú usa un fondo tenue + texto de acento, no un bloque
// naranja sólido (ver ajuste de diseño post-#46).
function navLinkClassName(isActive: boolean): string {
  const base =
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors';
  return isActive
    ? `${base} bg-accent-surface text-accent font-medium`
    : `${base} text-ink-muted hover:text-ink hover:bg-chrome-strong`;
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
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => navLinkClassName(isActive)}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" />
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
        <main className="flex-1 p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
