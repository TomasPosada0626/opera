import { Badge } from '../ui/Badge';
import {
  PURCHASE_STATUS_LABEL,
  PURCHASE_STATUS_VARIANT,
  SUPPLIER_PAYMENT_LABEL,
  SUPPLIER_PAYMENT_VARIANT,
} from '../../lib/purchase-status';
import type {
  PurchaseOrderStatus,
  SupplierPaymentStatus,
} from '../../types/purchase-order';

export function PurchaseStatusBadge({
  status,
}: {
  status: PurchaseOrderStatus;
}) {
  return (
    <Badge variant={PURCHASE_STATUS_VARIANT[status]} dot>
      {PURCHASE_STATUS_LABEL[status]}
    </Badge>
  );
}

export function SupplierPaymentBadge({
  status,
}: {
  status: SupplierPaymentStatus;
}) {
  return (
    <Badge variant={SUPPLIER_PAYMENT_VARIANT[status]}>
      {SUPPLIER_PAYMENT_LABEL[status]}
    </Badge>
  );
}
