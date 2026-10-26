import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaymentInput } from './useCreateRemission';
import type { PurchaseOrder } from '../types/purchase-order';

// Todo lo que cambia con una compra: su detalle, las listas, el saldo con
// el proveedor, el reporte de cuentas por pagar y el dashboard. Al recibir
// mercancía, además, el stock.
function invalidatePurchases(
  queryClient: ReturnType<typeof useQueryClient>,
  options: { stock?: boolean } = {},
) {
  void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  void queryClient.invalidateQueries({ queryKey: ['purchase-order'] });
  void queryClient.invalidateQueries({ queryKey: ['supplier-balance'] });
  void queryClient.invalidateQueries({ queryKey: ['payables'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  if (options.stock) {
    void queryClient.invalidateQueries({ queryKey: ['stock-summary'] });
    void queryClient.invalidateQueries({ queryKey: ['kardex'] });
  }
}

export interface PurchaseOrderLineInput {
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  warehouseId: string;
  items: PurchaseOrderLineInput[];
  expectedDate?: string;
  supplierInvoice?: string;
  notes?: string;
  initialPayment?: PaymentInput;
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) =>
      apiFetch<PurchaseOrder>('/purchase-orders', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidatePurchases(queryClient),
    meta: { successMessage: 'Compra registrada.' },
  });
}

export interface UpdatePurchaseOrderInput {
  id: string;
  expectedDate: string | null;
  supplierInvoice: string | null;
  notes: string | null;
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdatePurchaseOrderInput) =>
      apiFetch<PurchaseOrder>(`/purchase-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidatePurchases(queryClient),
    meta: { successMessage: 'Datos de la compra actualizados.' },
  });
}

export interface ReceivePurchaseOrderInput {
  id: string;
  items: { itemId: string; quantity: number }[];
  receivedAt?: string;
}

export function useReceivePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ReceivePurchaseOrderInput) =>
      apiFetch<PurchaseOrder>(`/purchase-orders/${id}/receive`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidatePurchases(queryClient, { stock: true }),
    meta: { successMessage: 'Mercancía recibida: el stock ya se actualizó.' },
  });
}

export function useClosePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PurchaseOrder>(`/purchase-orders/${id}/close`, {
        method: 'PATCH',
      }),
    onSuccess: () => invalidatePurchases(queryClient),
    meta: { successMessage: 'Compra cerrada con lo recibido.' },
  });
}

export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PurchaseOrder>(`/purchase-orders/${id}/cancel`, {
        method: 'PATCH',
      }),
    onSuccess: () => invalidatePurchases(queryClient),
    meta: { successMessage: 'Compra cancelada.' },
  });
}

export interface AddSupplierPaymentInput extends PaymentInput {
  purchaseOrderId: string;
}

export function useAddSupplierPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseOrderId, ...body }: AddSupplierPaymentInput) =>
      apiFetch<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}/payments`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidatePurchases(queryClient),
    meta: { successMessage: 'Pago registrado.' },
  });
}

export interface VoidSupplierPaymentInput {
  purchaseOrderId: string;
  paymentId: string;
  reason: string;
}

export function useVoidSupplierPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      purchaseOrderId,
      paymentId,
      reason,
    }: VoidSupplierPaymentInput) =>
      apiFetch<PurchaseOrder>(
        `/purchase-orders/${purchaseOrderId}/payments/${paymentId}/void`,
        { method: 'PATCH', body: JSON.stringify({ reason }) },
      ),
    onSuccess: () => invalidatePurchases(queryClient),
    meta: { successMessage: 'Pago anulado.' },
  });
}
