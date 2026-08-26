import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Customer } from '../types/customer';

// A diferencia de useCustomers (listado paginado), esto trae un solo
// cliente por id — usado por la vista de detalle.
export function useCustomer(customerId: string) {
  return useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => apiFetch<Customer>(`/customers/${customerId}`),
  });
}
