import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Order } from '../types/order';

// A diferencia de useOrders (listado paginado), esto trae un solo pedido
// por id — usado por la vista de detalle (#54) con sus líneas y remisiones.
export function useOrder(orderId: string) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: () => apiFetch<Order>(`/orders/${orderId}`),
  });
}
