import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Remission } from '../types/order';

export interface VoidRemissionInput {
  remissionId: string;
  // El pedido dueño de la remisión, solo para invalidar su query — no va
  // en el body del PATCH.
  orderId: string;
  reason: string;
}

// Anular mueve stock real (ENTRADA de reverso, ver backend) — a diferencia
// de useUpdateRemissionPayment, también invalida stock-summary.
export function useVoidRemission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: VoidRemissionInput) =>
      apiFetch<Remission>(`/remissions/${input.remissionId}/void`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: input.reason }),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['order', variables.orderId],
      });
      void queryClient.invalidateQueries({ queryKey: ['stock-summary'] });
    },
    meta: { successMessage: 'Remisión anulada.' },
  });
}
