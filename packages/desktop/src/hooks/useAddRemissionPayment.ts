import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Remission } from '../types/order';
import type { PaymentInput } from './useCreateRemission';

export interface AddRemissionPaymentInput extends PaymentInput {
  remissionId: string;
  // El pedido dueño de la remisión, solo para invalidar su query — no va
  // en el body del POST.
  orderId: string;
}

function invalidateCollection(
  queryClient: ReturnType<typeof useQueryClient>,
  orderId: string,
) {
  void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
  void queryClient.invalidateQueries({ queryKey: ['customer-balance'] });
  void queryClient.invalidateQueries({ queryKey: ['customer-payments'] });
  void queryClient.invalidateQueries({ queryKey: ['receivables'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}

export function useAddRemissionPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AddRemissionPaymentInput) =>
      apiFetch<Remission>(`/remissions/${input.remissionId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: input.amount,
          method: input.method,
          paidAt: input.paidAt,
          note: input.note,
        }),
      }),
    onSuccess: (_, variables) =>
      invalidateCollection(queryClient, variables.orderId),
    meta: { successMessage: 'Abono registrado.' },
  });
}

export interface VoidRemissionPaymentInput {
  remissionId: string;
  paymentId: string;
  orderId: string;
  reason: string;
}

export function useVoidRemissionPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: VoidRemissionPaymentInput) =>
      apiFetch<Remission>(
        `/remissions/${input.remissionId}/payments/${input.paymentId}/void`,
        { method: 'PATCH', body: JSON.stringify({ reason: input.reason }) },
      ),
    onSuccess: (_, variables) =>
      invalidateCollection(queryClient, variables.orderId),
    meta: { successMessage: 'Abono anulado.' },
  });
}
