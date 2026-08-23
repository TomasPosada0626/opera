import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { Order, OrderStatus } from '../types/order';

interface UseOrdersParams {
  page: number;
  pageSize: number;
  status?: OrderStatus;
}

export function useOrders({ page, pageSize, status }: UseOrdersParams) {
  return useQuery({
    queryKey: ['orders', { page, pageSize, status }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (status) {
        params.set('status', status);
      }
      return apiFetch<PaginatedResult<Order>>(`/orders?${params.toString()}`);
    },
    placeholderData: (previousData) => previousData,
  });
}
