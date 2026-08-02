import { createHashRouter } from 'react-router';
import RootLayout from './layouts/RootLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import NotFoundPage from './pages/NotFoundPage';

// HashRouter (no BrowserRouter): la app empaquetada carga desde file://, sin
// servidor que resuelva rutas de historial en un refresh — el hash sí
// funciona con un archivo estático.
export const router = createHashRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <DashboardPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
