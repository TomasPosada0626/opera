import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';

export interface CompleteProductionOrderInput {
  orderId: string;
  // Lo que salió bueno: es lo que entra al inventario (ADR 0012).
  producedQuantity: number;
}

export function useCompleteProductionOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, producedQuantity }: CompleteProductionOrderInput) =>
      apiFetch(`/production-orders/${orderId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ producedQuantity }),
      }),
    // Completar da entrada al terminado y, si era lo último de un pedido,
    // lo pasa a almacén: quedan obsoletos el stock y los pedidos.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    meta: { successMessage: 'Producción completada: ya entró al inventario.' },
  });
}
