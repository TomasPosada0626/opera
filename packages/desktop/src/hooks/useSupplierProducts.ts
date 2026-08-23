import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { SupplierProduct } from '../types/supplier';

interface UseSupplierProductsParams {
  supplierId: string;
  page?: number;
  pageSize?: number;
}

export function useSupplierProducts({
  supplierId,
  page = 1,
  pageSize = 50,
}: UseSupplierProductsParams) {
  return useQuery({
    queryKey: ['supplier-products', { supplierId, page, pageSize }],
    queryFn: () =>
      apiFetch<PaginatedResult<SupplierProduct>>(
        `/supplier-products?${new URLSearchParams({
          supplierId,
          page: String(page),
          pageSize: String(pageSize),
        }).toString()}`,
      ),
    enabled: !!supplierId,
  });
}
