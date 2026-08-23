import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Product, ProductType } from '../types/product';

export interface ProductInput {
  sku: string;
  name: string;
  type: ProductType;
  categoryId: string;
  unitId: string;
  minStock?: number;
  maxStock?: number;
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ProductInput) =>
      apiFetch<Product>('/products', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
