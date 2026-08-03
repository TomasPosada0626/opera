import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';

export interface CreateProductionOrderInput {
  productId: string;
  warehouseId: string;
  quantity: number;
}

export function useCreateProductionOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateProductionOrderInput) =>
      apiFetch('/production-orders', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
    },
  });
}
