import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useDeleteSupplierProduct } from '../../hooks/useDeleteSupplierProduct';
import { ApiError } from '../../lib/api-client';

interface DeleteSupplierProductActionProps {
  id: string;
}

// Vive en su propia fila (no en la página) porque cada botón necesita su
// propio estado de mutación/error — mismo motivo que ReceivePurchaseAction.
// Pide confirmación antes de disparar la mutación: es un borrado físico
// real (DELETE /supplier-products/:id), no un deactivate reversible.
export function DeleteSupplierProductAction({
  id,
}: DeleteSupplierProductActionProps) {
  const [confirming, setConfirming] = useState(false);
  const deleteSupplierProduct = useDeleteSupplierProduct();

  return (
    <div className="flex justify-end">
      <Button
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="px-3 py-1.5"
      >
        <Trash2 className="h-4 w-4" />
        Eliminar
      </Button>
      {confirming && (
        <ConfirmModal
          title="Eliminar precio de proveedor"
          message="Esta acción borra el precio de forma permanente y no se puede deshacer. ¿Continuar?"
          isPending={deleteSupplierProduct.isPending}
          error={
            deleteSupplierProduct.isError
              ? deleteSupplierProduct.error instanceof ApiError
                ? deleteSupplierProduct.error.message
                : 'No se pudo eliminar el precio.'
              : undefined
          }
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            deleteSupplierProduct.mutate(id, {
              onSuccess: () => setConfirming(false),
            })
          }
        />
      )}
    </div>
  );
}
