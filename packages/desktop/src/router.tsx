import { createHashRouter, redirect } from 'react-router';
import RootLayout from './layouts/RootLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import NotFoundPage from './pages/NotFoundPage';
import { getAuthToken } from './lib/auth-token';

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
        path: '/',
        // Sin sesión: nunca mostrar el dashboard sin pasar por login primero.
        // Esto es solo la verificación mínima ("¿hay token?") — la
        // navegación real según rol/permisos llega en #41.
        loader: () => (getAuthToken() ? null : redirect('/login')),
        element: <DashboardPage />,
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
