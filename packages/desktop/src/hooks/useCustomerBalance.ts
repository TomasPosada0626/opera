import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';

export interface CustomerBalance {
  totalBilled: string;
  totalPaid: string;
  balance: string;
}

// Se deriva de lo remisionado (no de lo pedido) menos lo pagado por
// remisión — nunca un campo propio, ver customers.service.ts.
export function useCustomerBalance(customerId: string) {
  return useQuery({
    queryKey: ['customer-balance', customerId],
    queryFn: () =>
      apiFetch<CustomerBalance>(`/customers/${customerId}/balance`),
  });
}
