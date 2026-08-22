import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { SalesReport } from '../types/report';

export interface DateRangeParams {
  from?: string;
  to?: string;
}

export function dateRangeSearchParams(
  params: DateRangeParams,
): URLSearchParams {
  const search = new URLSearchParams();
  if (params.from) {
    search.set('from', params.from);
  }
  if (params.to) {
    search.set('to', params.to);
  }
  return search;
}

export function useSalesReport(params: DateRangeParams) {
  return useQuery({
    queryKey: ['reports', 'ventas', params],
    queryFn: () => {
      const query = dateRangeSearchParams(params).toString();
      return apiFetch<SalesReport>(
        `/reports/ventas${query ? `?${query}` : ''}`,
      );
    },
  });
}
