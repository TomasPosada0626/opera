import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Supplier } from '../types/supplier';

export function useAnonymizeSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Supplier>(`/suppliers/${id}/anonymize`, { method: 'PATCH' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
    meta: { successMessage: 'Datos personales del proveedor eliminados.' },
  });
}
