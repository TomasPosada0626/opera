import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Order } from '../types/order';

export interface UpdateOrderInput {
  orderId: string;
  // null borra el valor; omitirlo lo deja como está (ver UpdateOrderDto).
  estimatedDeliveryDate?: string | null;
  notes?: string | null;
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, ...body }: UpdateOrderInput) =>
      apiFetch<Order>(`/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    meta: { successMessage: 'Seguimiento del pedido actualizado.' },
  });
}
