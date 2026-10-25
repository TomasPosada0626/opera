import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { RemissionPayment } from '../types/order';

export interface CustomerPayment extends RemissionPayment {
  remission: { id: string; number: number; orderId: string };
}

export function useCustomerPayments(customerId: string) {
  return useQuery({
    queryKey: ['customer-payments', customerId],
    queryFn: () =>
      apiFetch<CustomerPayment[]>(`/customers/${customerId}/payments`),
  });
}
