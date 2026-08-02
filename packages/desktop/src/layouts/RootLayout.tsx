import { Outlet } from 'react-router';

// Shell mínimo — la navegación real según rol (sidebar/menú) llega en #41.
function RootLayout() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Outlet />
    </div>
  );
}

export default RootLayout;
