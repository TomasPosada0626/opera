import type { PaymentMethod } from './order';

// Espejo de PurchaseOrder del backend (purchase-orders.service.ts, con el
// resumen de plata que agrega withSummary). Los Decimal llegan como string.
export type PurchaseOrderStatus =
  'PENDIENTE' | 'PARCIAL' | 'RECIBIDA' | 'CERRADA' | 'CANCELADA';

export type SupplierPaymentStatus =
  'PENDIENTE' | 'ABONADA' | 'PAGADA' | 'NO_APLICA';

interface UserRef {
  id: string;
  name: string;
}

export interface PurchaseReceipt {
  id: string;
  quantity: string;
  receivedAt: string;
  stockMovementId: string;
  user: UserRef;
}

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  quantity: string;
  unitCost: string;
  quantityReceived: string;
  position: number;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: { abbreviation: string };
  };
  receipts: PurchaseReceipt[];
}

export interface SupplierPayment {
  id: string;
  amount: string;
  method: PaymentMethod;
  paidAt: string;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  user: UserRef;
}

export interface PurchaseOrder {
  id: string;
  number: number;
  status: PurchaseOrderStatus;
  purchasedAt: string;
  expectedDate: string | null;
  supplierInvoice: string | null;
  notes: string | null;
  total: string;
  amountPaid: string;
  // false: compra migrada de la bitácora anterior, sin control de pagos.
  tracksPayment: boolean;
  closedAt: string | null;
  cancelledAt: string | null;
  supplier: { id: string; name: string };
  warehouse: { id: string; name: string };
  user: UserRef;
  items: PurchaseOrderItem[];
  payments: SupplierPayment[];
  // Calculados por el backend: lo que ya llegó, lo que se debe de eso y el
  // estado de pago contra el total.
  receivedValue: string;
  payable: string;
  paymentStatus: SupplierPaymentStatus;
  createdAt: string;
}

export interface SupplierBalance {
  totalPurchased: string;
  totalReceived: string;
  totalPaid: string;
  payable: string;
}

export interface PayablesRow {
  supplierId: string;
  supplierName: string;
  purchaseOrderCount: number;
  totalReceived: string;
  totalPaid: string;
  balance: string;
  oldestPendingAt: string;
  daysPending: number;
}
