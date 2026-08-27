import { PackageCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { useReceiveSupplierPurchase } from '../../hooks/useReceiveSupplierPurchase';
import { ApiError } from '../../lib/api-client';

interface ReceivePurchaseActionProps {
  purchaseId: string;
}

// Vive en su propia fila (no en la página) porque cada botón necesita su
// propio estado de mutación/error — mismo motivo que CompleteOrderAction.
export function ReceivePurchaseAction({
  purchaseId,
}: ReceivePurchaseActionProps) {
  const receivePurchase = useReceiveSupplierPurchase();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        onClick={() => receivePurchase.mutate(purchaseId)}
        disabled={receivePurchase.isPending}
        className="px-3 py-1.5"
      >
        <PackageCheck className="h-4 w-4" />
        {receivePurchase.isPending ? 'Recibiendo…' : 'Marcar recibida'}
      </Button>
      {receivePurchase.isError && (
        <p className="text-danger max-w-48 text-right text-xs">
          {receivePurchase.error instanceof ApiError
            ? receivePurchase.error.message
            : 'No se pudo marcar como recibida.'}
        </p>
      )}
    </div>
  );
}
