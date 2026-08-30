import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Customer } from '../types/customer';

export function useAnonymizeCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Customer>(`/customers/${id}/anonymize`, { method: 'PATCH' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    meta: { successMessage: 'Datos personales del cliente eliminados.' },
  });
}
