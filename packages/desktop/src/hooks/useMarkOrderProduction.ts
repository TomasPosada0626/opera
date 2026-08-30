import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Order } from '../types/order';

export function useMarkOrderProduction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) =>
      apiFetch<Order>(`/orders/${orderId}/mark-production`, {
        method: 'PATCH',
      }),
    // Solo cambia una bandera y un timestamp — no mueve stock, así que no
    // hay nada de inventario que invalidar acá (a diferencia de
    // useMarkOrderWarehoused).
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order', order.id] });
    },
    meta: { successMessage: 'Pedido enviado a producción.' },
  });
}
