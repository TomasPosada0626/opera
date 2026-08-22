import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Order } from '../types/order';

export interface CreateOrderInput {
  customerId: string;
  warehouseId: string;
  items: { productId: string; quantity: number; unitPrice: number }[];
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateOrderInput) =>
      apiFetch<Order>('/orders', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    // Un pedido descuenta stock de inmediato (#51) — el listado de
    // inventario/stock queda desactualizado igual que con un movimiento
    // manual, no solo la lista de pedidos.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-summary'] });
    },
  });
}
