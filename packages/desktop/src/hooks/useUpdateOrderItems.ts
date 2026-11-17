import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Order } from '../types/order';

export interface UpdateOrderItemsInput {
  orderId: string;
  // La lista completa como debe quedar el pedido (ADR 0013): con `id` es
  // una línea que ya existe, sin `id` una nueva, y la que no viene se quita.
  items: {
    id?: string;
    productId: string;
    quantity: number;
    unitPrice: number;
  }[];
}

export function useUpdateOrderItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, items }: UpdateOrderItemsInput) =>
      apiFetch<Order>(`/orders/${orderId}/items`, {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }),
    // Cambiar cantidades ajusta las órdenes de producción del pedido y
    // puede cambiarle el estado, así que se refrescan también Producción y
    // el dashboard.
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    meta: { successMessage: 'Productos del pedido actualizados.' },
  });
}
