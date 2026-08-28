import { Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { useDeleteSupplierProduct } from '../../hooks/useDeleteSupplierProduct';
import { ApiError } from '../../lib/api-client';

interface DeleteSupplierProductActionProps {
  id: string;
}

// Vive en su propia fila (no en la página) porque cada botón necesita su
// propio estado de mutación/error — mismo motivo que ReceivePurchaseAction.
export function DeleteSupplierProductAction({
  id,
}: DeleteSupplierProductActionProps) {
  const deleteSupplierProduct = useDeleteSupplierProduct();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        onClick={() => deleteSupplierProduct.mutate(id)}
        disabled={deleteSupplierProduct.isPending}
        className="px-3 py-1.5"
      >
        <Trash2 className="h-4 w-4" />
        {deleteSupplierProduct.isPending ? 'Eliminando…' : 'Eliminar'}
      </Button>
      {deleteSupplierProduct.isError && (
        <p className="text-danger max-w-48 text-right text-xs">
          {deleteSupplierProduct.error instanceof ApiError
            ? deleteSupplierProduct.error.message
            : 'No se pudo eliminar el precio.'}
        </p>
      )}
    </div>
  );
}
