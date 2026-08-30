import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Remission, RemissionPaymentStatus } from '../types/order';

export interface UpdateRemissionPaymentInput {
  remissionId: string;
  // El pedido dueño de la remisión, solo para invalidar su query — no va
  // en el body del PATCH.
  orderId: string;
  paymentStatus: RemissionPaymentStatus;
  amountPaid?: number;
}

export function useUpdateRemissionPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateRemissionPaymentInput) =>
      apiFetch<Remission>(`/remissions/${input.remissionId}/payment`, {
        method: 'PATCH',
        body: JSON.stringify({
          paymentStatus: input.paymentStatus,
          amountPaid: input.amountPaid,
        }),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['order', variables.orderId],
      });
    },
    meta: { successMessage: 'Pago de remisión actualizado.' },
  });
}
