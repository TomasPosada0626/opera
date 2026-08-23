import { createHashRouter, redirect } from 'react-router';
import RootLayout from './layouts/RootLayout';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InventoryPage from './pages/InventoryPage';
import KardexPage from './pages/KardexPage';
import ProductsPage from './pages/ProductsPage';
import CategoriesPage from './pages/CategoriesPage';
import UnitsPage from './pages/UnitsPage';
import WarehousesPage from './pages/WarehousesPage';
import ProductionOrdersPage from './pages/ProductionOrdersPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';
import NotFoundPage from './pages/NotFoundPage';
import { getAuthToken, initAuthToken } from './lib/auth-token';
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
        // `createHashRouter` dispara el loader de la ruta inicial al
        // crearse (import-time de este módulo), antes de que main.tsx
        // termine de hidratar el token — hay que esperar esa hidratación
        // aquí mismo, no basta con esperarla una vez en main.tsx.
        loader: async () => {
          await initAuthToken();
          return getAuthToken() ? redirect('/') : null;
        },
        element: <LoginPage />,
      },
      {
        element: <AppLayout />,
        // Un solo loader en el layout protege TODAS sus rutas hijas — no
        // hay que repetir "¿hay token?" en cada una (#41).
        loader: async () => {
          await initAuthToken();
          return getAuthToken() ? null : redirect('/login');
        },
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/inventario', element: <InventoryPage /> },
          {
            path: '/inventario/:productId/kardex',
            element: <KardexPage />,
          },
          { path: '/produccion', element: <ProductionOrdersPage /> },
          { path: '/productos', element: <ProductsPage /> },
          { path: '/categorias', element: <CategoriesPage /> },
          { path: '/unidades', element: <UnitsPage /> },
          { path: '/bodegas', element: <WarehousesPage /> },
          { path: '/pedidos', element: <OrdersPage /> },
          { path: '/pedidos/:orderId', element: <OrderDetailPage /> },
          { path: '/clientes', element: <CustomersPage /> },
          { path: '/proveedores', element: <SuppliersPage /> },
          { path: '/reportes', element: <ReportsPage /> },
          {
            path: '/usuarios',
            // Ocultar el ítem del sidebar es UX, no seguridad — la
            // seguridad real ya la hace el backend (@Roles('ADMIN') en
            // /users desde M1). Este loader es la versión de "no dejar
            // llegar por URL directa" del mismo filtro, no un reemplazo.
            // Los loaders hijos corren en paralelo con el del layout
            // padre (no en secuencia), así que también necesita esperar
            // la hidratación por su cuenta.
            loader: async () => {
              await initAuthToken();
              return getCurrentUser()?.roles.includes('ADMIN')
                ? null
                : redirect('/');
            },
            element: <UsersPage />,
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
