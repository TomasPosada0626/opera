import { Outlet } from 'react-router';
import { ThemeToggle } from '../components/ui/ThemeToggle';

// Shell mínimo — la navegación real según rol (sidebar/menú) llega en #41.
// El switch de tema vive aquí porque es una preferencia global, visible en
// cualquier pantalla (incluido login), no algo específico de una sola vista.
function RootLayout() {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <Outlet />
    </div>
  );
}

export default RootLayout;
