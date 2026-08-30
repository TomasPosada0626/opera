import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Customer } from '../types/customer';

export interface CustomerInput {
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CustomerInput) =>
      apiFetch<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    meta: { successMessage: 'Cliente creado.' },
  });
}
