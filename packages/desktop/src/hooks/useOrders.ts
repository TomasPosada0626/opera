import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { Order, OrderStatus } from '../types/order';

interface UseOrdersParams {
  page: number;
  pageSize: number;
  status?: OrderStatus;
  customerId?: string;
  // Solo los que ya pasaron su fecha de envío sin despacharse.
  overdue?: boolean;
  // Número de pedido exacto.
  search?: string;
  sortBy?: 'createdAt' | 'number' | 'estimatedDeliveryDate' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export function useOrders({
  page,
  pageSize,
  status,
  customerId,
  overdue,
  search,
  sortBy,
  sortOrder,
}: UseOrdersParams) {
  return useQuery({
    queryKey: [
      'orders',
      {
        page,
        pageSize,
        status,
        customerId,
        overdue,
        search,
        sortBy,
        sortOrder,
      },
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (status) {
        params.set('status', status);
      }
      if (customerId) {
        params.set('customerId', customerId);
      }
      if (overdue) {
        params.set('overdue', 'true');
      }
      if (search) {
        params.set('search', search);
      }
      if (sortBy) {
        params.set('sortBy', sortBy);
        params.set('sortOrder', sortOrder ?? 'desc');
      }
      return apiFetch<PaginatedResult<Order>>(`/orders?${params.toString()}`);
    },
    placeholderData: (previousData) => previousData,
  });
}
