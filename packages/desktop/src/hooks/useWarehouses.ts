import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { Warehouse } from '../types/inventory';

// pageSize alto en vez de paginar: el formulario de movimiento (#43)
// necesita todas las bodegas para un <select>, no una página a la vez.
export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: () =>
      apiFetch<PaginatedResult<Warehouse>>('/warehouses?page=1&pageSize=100'),
  });
}
