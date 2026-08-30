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
    // Este negocio fabrica sobre pedido — crear el pedido ya no mueve stock
    // (ver orders.service.ts), así que no hay nada que invalidar en
    // inventario acá; eso ahora pasa en useMarkOrderWarehoused y
    // useCreateRemission, que sí mueven stock de verdad.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    meta: { successMessage: 'Pedido creado.' },
  });
}
