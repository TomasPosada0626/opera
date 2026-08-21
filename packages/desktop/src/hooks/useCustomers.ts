import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { Customer } from '../types/customer';

interface UseCustomersParams {
  page: number;
  pageSize: number;
  search?: string;
}

export function useCustomers({ page, pageSize, search }: UseCustomersParams) {
  return useQuery({
    queryKey: ['customers', { page, pageSize, search }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) {
        params.set('search', search);
      }
      return apiFetch<PaginatedResult<Customer>>(
        `/customers?${params.toString()}`,
      );
    },
    // Mantiene la página anterior visible mientras llega la siguiente en vez
    // de mostrar el estado de carga en cada cambio de página/búsqueda.
    placeholderData: (previousData) => previousData,
  });
}
