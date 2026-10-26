import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type {
  PayablesRow,
  PurchaseOrder,
  PurchaseOrderStatus,
  SupplierBalance,
} from '../types/purchase-order';

export interface PurchaseOrdersParams {
  page: number;
  pageSize: number;
  supplierId?: string;
  status?: PurchaseOrderStatus;
  // Solo las que todavía tienen algo por recibir.
  open?: boolean;
  // Número de compra exacto.
  search?: string;
}

export function usePurchaseOrders(params: PurchaseOrdersParams) {
  return useQuery({
    queryKey: ['purchase-orders', params],
    queryFn: () => {
      const query = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
      });
      if (params.supplierId) query.set('supplierId', params.supplierId);
      if (params.status) query.set('status', params.status);
      if (params.open) query.set('open', 'true');
      if (params.search) query.set('search', params.search);
      return apiFetch<PaginatedResult<PurchaseOrder>>(
        `/purchase-orders?${query.toString()}`,
      );
    },
    placeholderData: (previousData) => previousData,
  });
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => apiFetch<PurchaseOrder>(`/purchase-orders/${id}`),
    enabled: !!id,
  });
}

export function useSupplierBalance(supplierId: string) {
  return useQuery({
    queryKey: ['supplier-balance', supplierId],
    queryFn: () =>
      apiFetch<SupplierBalance>(`/suppliers/${supplierId}/balance`),
    enabled: !!supplierId,
  });
}

export function usePayablesReport() {
  return useQuery({
    queryKey: ['payables'],
    queryFn: () => apiFetch<PayablesRow[]>('/reports/por-pagar'),
  });
}
