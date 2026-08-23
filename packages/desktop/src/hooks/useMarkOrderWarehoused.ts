import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Order } from '../types/order';

export function useMarkOrderWarehoused() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) =>
      apiFetch<Order>(`/orders/${orderId}/mark-warehoused`, {
        method: 'POST',
      }),
    // El terminado entra al stock de verdad acá (ENTRADA por línea) — el
    // listado de inventario/stock queda desactualizado igual que con un
    // movimiento manual, no solo la lista de pedidos.
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      void queryClient.invalidateQueries({ queryKey: ['stock-summary'] });
    },
  });
}
