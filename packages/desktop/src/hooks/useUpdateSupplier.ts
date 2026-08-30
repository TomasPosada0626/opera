import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Supplier } from '../types/supplier';
import type { SupplierInput } from './useCreateSupplier';

export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: SupplierInput & { id: string }) =>
      apiFetch<Supplier>(`/suppliers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    meta: { successMessage: 'Proveedor actualizado.' },
  });
}
