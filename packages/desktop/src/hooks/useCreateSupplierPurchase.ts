import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { SupplierPurchase } from '../types/supplier';

export interface CreateSupplierPurchaseInput {
  supplierId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCost: number;
  purchasedAt?: string;
}

export function useCreateSupplierPurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateSupplierPurchaseInput) =>
      apiFetch<SupplierPurchase>('/supplier-purchases', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['supplier-purchases'],
      });
    },
  });
}
