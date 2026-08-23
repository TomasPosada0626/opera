import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { SupplierPurchase } from '../types/supplier';

interface UseSupplierPurchasesParams {
  supplierId: string;
  page?: number;
  pageSize?: number;
}

export function useSupplierPurchases({
  supplierId,
  page = 1,
  pageSize = 50,
}: UseSupplierPurchasesParams) {
  return useQuery({
    queryKey: ['supplier-purchases', { supplierId, page, pageSize }],
    queryFn: () =>
      apiFetch<PaginatedResult<SupplierPurchase>>(
        `/supplier-purchases?${new URLSearchParams({
          supplierId,
          page: String(page),
          pageSize: String(pageSize),
        }).toString()}`,
      ),
    enabled: !!supplierId,
  });
}
