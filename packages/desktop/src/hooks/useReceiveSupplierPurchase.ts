import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { SupplierPurchase } from '../types/supplier';

// Reconciliación (#104-purchases): marca una compra como recibida y mueve
// stock real (ENTRADA) — por eso también invalida stock-summary, no solo
// la propia lista de compras.
export function useReceiveSupplierPurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (purchaseId: string) =>
      apiFetch<SupplierPurchase>(`/supplier-purchases/${purchaseId}/receive`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['supplier-purchases'],
      });
      void queryClient.invalidateQueries({ queryKey: ['stock-summary'] });
    },
    meta: { successMessage: 'Compra recibida — stock actualizado.' },
  });
}
