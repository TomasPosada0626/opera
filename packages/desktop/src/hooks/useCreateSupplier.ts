import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Supplier } from '../types/supplier';

export interface SupplierInput {
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: SupplierInput) =>
      apiFetch<Supplier>('/suppliers', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}
