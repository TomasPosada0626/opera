import { Suspense } from 'react';
import { createHashRouter, redirect } from 'react-router';
import RootLayout from './layouts/RootLayout';
import AppLayout from './layouts/AppLayout';
import { PageFallback } from './components/ui/PageFallback';
import { getAuthToken, initAuthToken } from './lib/auth-token';
import { getCurrentUser } from './lib/current-user';
import { apiFetch } from './lib/api-client';
import {
  CategoriesPage,
  CustomerDetailPage,
  CustomersPage,
  DashboardPage,
  ForgotPasswordPage,
  InventoryPage,
  KardexPage,
  LoginPage,
  NotFoundPage,
  OrderDetailPage,
  OrdersPage,
  PrintRemissionPage,
  ProductionOrdersPage,
  ProductsPage,
  ReportsPage,
  SetupPage,
  SupplierDetailPage,
  SuppliersPage,
  UnitsPage,
  UsersPage,
  WarehousesPage,
} from './pages/lazy';

// Sin sesión previa alguna en esta instalación (GET /setup/status) -- ver
// /configurar y el loader de /login más abajo. Si la llamada falla (backend
// no alcanzable, hiccup de red) se asume que no hace falta configurar nada:
// mejor mostrar el login normal (que ya sabe fallar con su propio mensaje
// al enviarse) que dejar la ruta entera sin renderizar nada.
async function needsSetup(): Promise<boolean> {
  return apiFetch<{ needsSetup: boolean }>('/setup/status')
    .then((response) => response.needsSetup)
    .catch(() => false);
}

// Code-splitting por ruta (#21, auditoría) -- antes las ~20 páginas se
// importaban de forma estática, un solo bundle de 567 KB cargado entero al
// arrancar. pages/lazy.ts define un import() dinámico por página (su propio
// chunk, descargado solo al visitar esa ruta) -- separado de este archivo
// porque mezclar componentes lazy con `router` (no un componente) en el
// mismo módulo rompe el Fast Refresh de Vite. Las rutas anidadas de
// AppLayout comparten un único <Suspense> alrededor de su <Outlet> (ver
// AppLayout.tsx) -- las tres rutas de nivel raíz (login, recuperar
// contraseña, imprimir remisión) y NotFound necesitan el suyo propio porque
// no viven dentro de ese Outlet.

// HashRouter (no BrowserRouter): la app empaquetada carga desde file://, sin
// servidor que resuelva rutas de historial en un refresh — el hash sí
// funciona con un archivo estático.
export const router = createHashRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/login',
        // Primero needsSetup (instalación sin ningún usuario todavía manda
        // directo a /configurar, sesión previa o no) y recién después la
        // lógica ya existente: con sesión, /login no tiene nada que hacer,
        // manda al dashboard. `createHashRouter` dispara el loader de la
        // ruta inicial al crearse (import-time de este módulo), antes de
        // que main.tsx termine de hidratar el token — hay que esperar esa
        // hidratación aquí mismo, no basta con esperarla una vez en main.tsx.
        loader: async () => {
          if (await needsSetup()) {
            return redirect('/configurar');
          }
          await initAuthToken();
          return getAuthToken() ? redirect('/') : null;
        },
        element: (
          <Suspense fallback={<PageFallback />}>
            <LoginPage />
          </Suspense>
        ),
      },
      {
        path: '/configurar',
        // Ruta de una sola vez por instalación -- si ya hay un usuario
        // (needsSetup: false), no tiene nada que hacer acá, misma idea que
        // /login redirigiendo al dashboard con sesión activa.
        loader: async () => {
          return (await needsSetup()) ? null : redirect('/login');
        },
        element: (
          <Suspense fallback={<PageFallback />}>
            <SetupPage />
          </Suspense>
        ),
      },
      {
        path: '/olvide-contrasena',
        // Mismo criterio que /login: con sesión activa no tiene nada que
        // hacer acá, manda al dashboard en vez de mostrar el flujo.
        loader: async () => {
          await initAuthToken();
          return getAuthToken() ? redirect('/') : null;
        },
        element: (
          <Suspense fallback={<PageFallback />}>
            <ForgotPasswordPage />
          </Suspense>
        ),
      },
      {
        path: '/imprimir-remision',
        // Standalone (fuera de AppLayout) a propósito: sin sidebar/topbar
        // que ocultar con @media print — toda la página es la superficie
        // imprimible salvo su propia barra de búsqueda.
        loader: async () => {
          await initAuthToken();
          return getAuthToken() ? null : redirect('/login');
        },
        element: (
          <Suspense fallback={<PageFallback />}>
            <PrintRemissionPage />
          </Suspense>
        ),
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
          {
            path: '/clientes/:customerId',
            element: <CustomerDetailPage />,
          },
          { path: '/proveedores', element: <SuppliersPage /> },
          {
            path: '/proveedores/:supplierId',
            element: <SupplierDetailPage />,
          },
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
      {
        path: '*',
        element: (
          <Suspense fallback={<PageFallback />}>
            <NotFoundPage />
          </Suspense>
        ),
      },
    ],
  },
]);
