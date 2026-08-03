import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { ProductionOrder } from '../types/production';

interface UseProductionOrdersParams {
  page: number;
  pageSize: number;
}

export function useProductionOrders({
  page,
  pageSize,
}: UseProductionOrdersParams) {
  return useQuery({
    queryKey: ['production-orders', { page, pageSize }],
    queryFn: () =>
      apiFetch<PaginatedResult<ProductionOrder>>(
        `/production-orders?page=${page}&pageSize=${pageSize}`,
      ),
    placeholderData: (previousData) => previousData,
  });
}
