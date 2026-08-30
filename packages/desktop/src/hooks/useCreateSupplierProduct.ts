import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { SupplierProduct } from '../types/supplier';

export interface CreateSupplierProductInput {
  supplierId: string;
  productId: string;
  price: number;
}

export function useCreateSupplierProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateSupplierProductInput) =>
      apiFetch<SupplierProduct>('/supplier-products', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-products'] });
    },
    meta: { successMessage: 'Precio de proveedor agregado.' },
  });
}
