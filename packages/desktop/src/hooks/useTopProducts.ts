import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { TopProductRow } from '../types/report';
import { dateRangeSearchParams, type DateRangeParams } from './useSalesReport';

interface UseTopProductsParams extends DateRangeParams {
  sortOrder: 'asc' | 'desc';
  limit?: number;
}

export function useTopProducts(params: UseTopProductsParams) {
  return useQuery({
    queryKey: ['reports', 'productos-mas-vendidos', params],
    queryFn: () => {
      const search = dateRangeSearchParams(params);
      search.set('sortOrder', params.sortOrder);
      if (params.limit) {
        search.set('limit', String(params.limit));
      }
      return apiFetch<TopProductRow[]>(
        `/reports/productos-mas-vendidos?${search.toString()}`,
      );
    },
  });
}
