import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult, Product } from '../types/product';

interface UseProductsParams {
  page: number;
  pageSize: number;
  search?: string;
}

export function useProducts({ page, pageSize, search }: UseProductsParams) {
  return useQuery({
    queryKey: ['products', { page, pageSize, search }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) {
        params.set('search', search);
      }
      return apiFetch<PaginatedResult<Product>>(
        `/products?${params.toString()}`,
      );
    },
    // Mantiene la página anterior visible mientras llega la siguiente en vez
    // de mostrar el estado de carga en cada cambio de página/búsqueda.
    placeholderData: (previousData) => previousData,
  });
}
