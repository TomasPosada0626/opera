import { createHashRouter, redirect } from 'react-router';
import RootLayout from './layouts/RootLayout';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InventoryPage from './pages/InventoryPage';
import ProductionOrdersPage from './pages/ProductionOrdersPage';
import UsersPage from './pages/UsersPage';
import NotFoundPage from './pages/NotFoundPage';
import { getAuthToken } from './lib/auth-token';
import { getCurrentUser } from './lib/current-user';

// HashRouter (no BrowserRouter): la app empaquetada carga desde file://, sin
// servidor que resuelva rutas de historial en un refresh — el hash sí
// funciona con un archivo estático.
export const router = createHashRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/login',
        // Ya con sesión: /login no tiene nada que hacer, manda al dashboard.
        loader: () => (getAuthToken() ? redirect('/') : null),
        element: <LoginPage />,
      },
      {
        element: <AppLayout />,
        // Un solo loader en el layout protege TODAS sus rutas hijas — no
        // hay que repetir "¿hay token?" en cada una (#41).
        loader: () => (getAuthToken() ? null : redirect('/login')),
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/inventario', element: <InventoryPage /> },
          { path: '/produccion', element: <ProductionOrdersPage /> },
          {
            path: '/usuarios',
            // Ocultar el ítem del sidebar es UX, no seguridad — la
            // seguridad real ya la hace el backend (@Roles('ADMIN') en
            // /users desde M1). Este loader es la versión de "no dejar
            // llegar por URL directa" del mismo filtro, no un reemplazo.
            loader: () =>
              getCurrentUser()?.roles.includes('ADMIN') ? null : redirect('/'),
            element: <UsersPage />,
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
