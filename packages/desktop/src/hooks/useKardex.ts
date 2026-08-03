import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { StockMovementEntry } from '../types/inventory';

interface UseKardexParams {
  productId: string;
  page: number;
  pageSize: number;
  warehouseId?: string;
}

export function useKardex({
  productId,
  page,
  pageSize,
  warehouseId,
}: UseKardexParams) {
  return useQuery({
    queryKey: ['kardex', productId, { page, pageSize, warehouseId }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (warehouseId) {
        params.set('warehouseId', warehouseId);
      }
      return apiFetch<PaginatedResult<StockMovementEntry>>(
        `/inventory/${productId}/kardex?${params.toString()}`,
      );
    },
    placeholderData: (previousData) => previousData,
  });
}
