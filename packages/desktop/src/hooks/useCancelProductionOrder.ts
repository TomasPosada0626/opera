import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';

// No mueve stock (crear la orden nunca lo hizo) — solo invalida la lista,
// a diferencia de completar (que sí toca stock-summary).
export function useCancelProductionOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) =>
      apiFetch(`/production-orders/${orderId}/cancel`, { method: 'PATCH' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
    },
  });
}
