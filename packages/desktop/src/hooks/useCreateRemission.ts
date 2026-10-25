import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaymentMethod, Remission } from '../types/order';

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  // ISO; sin esto el backend usa "ahora".
  paidAt?: string;
  note?: string;
}

export interface CreateRemissionInput {
  orderId: string;
  items: { orderItemId: string; quantity: number }[];
  // Lo que el cliente pagó al recibir, si pagó algo. El estado de pago lo
  // calcula el backend — ya no se elige.
  initialPayment?: PaymentInput;
}

export function useCreateRemission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateRemissionInput) =>
      apiFetch<Remission>('/remissions', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (_, variables) => {
      // El pedido es lo que muestra "cuánto se ha entregado" (deriva sus
      // propias remisiones incluidas), no un endpoint de remisiones aparte.
      // Puede haber pasado a DESPACHADO, así que también la lista.
      void queryClient.invalidateQueries({
        queryKey: ['order', variables.orderId],
      });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      // A diferencia del diseño original, ahora la remisión (despacho) es
      // el momento en que el stock de verdad sale del almacén — el pedido
      // ya no lo descuenta al crearse.
      void queryClient.invalidateQueries({ queryKey: ['stock-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-balance'] });
    },
    meta: { successMessage: 'Remisión creada.' },
  });
}
