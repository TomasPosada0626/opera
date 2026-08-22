import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Remission } from '../types/order';

export interface CreateRemissionInput {
  orderId: string;
  items: { orderItemId: string; quantity: number }[];
}

export function useCreateRemission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, ...body }: CreateRemissionInput) =>
      apiFetch<Remission>('/remissions', {
        method: 'POST',
        body: JSON.stringify({ orderId, ...body }),
      }),
    onSuccess: (_, variables) => {
      // El pedido es lo que muestra "cuánto se ha entregado" (deriva sus
      // propias remisiones incluidas), no un endpoint de remisiones aparte.
      void queryClient.invalidateQueries({
        queryKey: ['order', variables.orderId],
      });
    },
  });
}
