import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { Order } from '../types/order';

interface UseOrdersParams {
  page: number;
  pageSize: number;
}

export function useOrders({ page, pageSize }: UseOrdersParams) {
  return useQuery({
    queryKey: ['orders', { page, pageSize }],
    queryFn: () =>
      apiFetch<PaginatedResult<Order>>(
        `/orders?page=${page}&pageSize=${pageSize}`,
      ),
  });
}
