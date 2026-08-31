import { lazy } from 'react';

// Code-splitting por ruta (#21, auditoría) -- un import() dinámico por
// página en vez del import estático que router.tsx tenía antes, así cada
// una es su propio chunk descargado solo al visitar esa ruta. Separado de
// router.tsx a propósito: un archivo que exporta `router` (no un
// componente) junto a declaraciones lazy() rompe el Fast Refresh de Vite
// (react-refresh/only-export-components) -- este archivo solo exporta
// componentes, así que sí puede hacer fast refresh.
export const LoginPage = lazy(() => import('./LoginPage'));
export const ForgotPasswordPage = lazy(() => import('./ForgotPasswordPage'));
export const DashboardPage = lazy(() => import('./DashboardPage'));
export const InventoryPage = lazy(() => import('./InventoryPage'));
export const KardexPage = lazy(() => import('./KardexPage'));
export const ProductsPage = lazy(() => import('./ProductsPage'));
export const CategoriesPage = lazy(() => import('./CategoriesPage'));
export const UnitsPage = lazy(() => import('./UnitsPage'));
export const WarehousesPage = lazy(() => import('./WarehousesPage'));
export const ProductionOrdersPage = lazy(
  () => import('./ProductionOrdersPage'),
);
export const OrdersPage = lazy(() => import('./OrdersPage'));
export const OrderDetailPage = lazy(() => import('./OrderDetailPage'));
export const CustomersPage = lazy(() => import('./CustomersPage'));
export const CustomerDetailPage = lazy(() => import('./CustomerDetailPage'));
export const SuppliersPage = lazy(() => import('./SuppliersPage'));
export const SupplierDetailPage = lazy(() => import('./SupplierDetailPage'));
export const PrintRemissionPage = lazy(() => import('./PrintRemissionPage'));
export const ReportsPage = lazy(() => import('./ReportsPage'));
export const UsersPage = lazy(() => import('./UsersPage'));
export const NotFoundPage = lazy(() => import('./NotFoundPage'));
