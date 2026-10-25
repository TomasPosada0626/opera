import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { BillOfMaterials } from '../types/production';

export function useBillOfMaterials(productId: string) {
  return useQuery({
    queryKey: ['bill-of-materials', productId],
    queryFn: () =>
      apiFetch<BillOfMaterials>(`/products/${productId}/bill-of-materials`),
  });
}

export interface SaveBillOfMaterialsInput {
  productId: string;
  items: { componentId: string; quantity: number }[];
}

export function useSaveBillOfMaterials() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, items }: SaveBillOfMaterialsInput) =>
      apiFetch<BillOfMaterials>(`/products/${productId}/bill-of-materials`, {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['bill-of-materials', variables.productId],
      });
    },
    meta: { successMessage: 'Lista de materiales guardada.' },
  });
}

export function useDeleteBillOfMaterials() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) =>
      apiFetch<{ productId: string }>(
        `/products/${productId}/bill-of-materials`,
        { method: 'DELETE' },
      ),
    onSuccess: (_, productId) => {
      void queryClient.invalidateQueries({
        queryKey: ['bill-of-materials', productId],
      });
    },
    meta: { successMessage: 'Lista de materiales eliminada.' },
  });
}
