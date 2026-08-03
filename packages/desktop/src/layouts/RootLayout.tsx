import { Outlet } from 'react-router';

// Shell mínimo que envuelve TODA la app, incluido /login. El switch de tema
// vive en cada layout hijo (LoginPage, AppLayout) en vez de aquí — ponerlo
// en este nivel lo duplicaría dentro de AppLayout, que ya tiene el suyo en
// la topbar.
function RootLayout() {
  return (
    <div className="bg-surface text-ink min-h-screen">
      <Outlet />
    </div>
  );
}

export default RootLayout;
