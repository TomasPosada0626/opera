import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';

export function useCompleteProductionOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) =>
      apiFetch(`/production-orders/${orderId}/complete`, { method: 'POST' }),
    // Completar consume materias primas y da entrada al terminado — ambas
    // queries quedan obsoletas, no solo la lista de órdenes.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-summary'] });
    },
  });
}
