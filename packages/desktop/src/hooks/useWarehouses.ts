import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { Warehouse } from '../types/inventory';

interface UseWarehousesParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

// Params opcionales con los mismos defaults que antes (page 1, pageSize
// 100, sin búsqueda) — los pickers/selects existentes (#43, #45, #51, #44)
// siguen llamando useWarehouses() sin argumentos para traer "todas las
// bodegas de una vez"; WarehousesPage (#95) pasa page/pageSize/search
// explícitos para su propia tabla paginada. Mismo hook, no uno duplicado.
export function useWarehouses({
  page = 1,
  pageSize = 100,
  search,
}: UseWarehousesParams = {}) {
  return useQuery({
    queryKey: ['warehouses', { page, pageSize, search }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) {
        params.set('search', search);
      }
      return apiFetch<PaginatedResult<Warehouse>>(
        `/warehouses?${params.toString()}`,
      );
    },
    placeholderData: (previousData) => previousData,
  });
}

// Herrajes Toro (como la mayoría de quienes usan Opera) trabaja desde una
// sola fábrica: mientras exista una sola bodega, la interfaz no habla de
// bodegas (sin columnas, filtros ni menú). El modelo sigue soportando
// varias para el día que haga falta; esto es solo presentación, igual que
// el autoselect de WarehouseSelect.
export function useHasSeveralWarehouses(): boolean {
  const { data } = useWarehouses();
  return (
    (data?.data ?? []).filter((warehouse) => warehouse.isActive).length > 1
  );
}
