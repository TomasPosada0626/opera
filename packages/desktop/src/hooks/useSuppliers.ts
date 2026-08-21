import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { Supplier } from '../types/supplier';

interface UseSuppliersParams {
  page: number;
  pageSize: number;
  search?: string;
}

export function useSuppliers({ page, pageSize, search }: UseSuppliersParams) {
  return useQuery({
    queryKey: ['suppliers', { page, pageSize, search }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) {
        params.set('search', search);
      }
      return apiFetch<PaginatedResult<Supplier>>(
        `/suppliers?${params.toString()}`,
      );
    },
    // Mantiene la página anterior visible mientras llega la siguiente en vez
    // de mostrar el estado de carga en cada cambio de página/búsqueda.
    placeholderData: (previousData) => previousData,
  });
}
