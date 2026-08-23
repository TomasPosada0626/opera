import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult, Unit } from '../types/product';

interface UseUnitsParams {
  page: number;
  pageSize: number;
  search?: string;
}

export function useUnits({ page, pageSize, search }: UseUnitsParams) {
  return useQuery({
    queryKey: ['units', { page, pageSize, search }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) {
        params.set('search', search);
      }
      return apiFetch<PaginatedResult<Unit>>(`/units?${params.toString()}`);
    },
    placeholderData: (previousData) => previousData,
  });
}
