import { Pencil, UserX } from 'lucide-react';
import { Button } from '../ui/Button';
import { useDeactivateSupplier } from '../../hooks/useDeactivateSupplier';
import { ApiError } from '../../lib/api-client';
import type { Supplier } from '../../types/supplier';

interface SupplierRowActionsProps {
  supplier: Supplier;
  onEdit: (supplier: Supplier) => void;
}

// Desactivar vive en su propia fila (no en la página), mismo motivo que
// CompleteOrderAction (#45) y CustomerRowActions (#48): cada botón necesita
// su propio estado de mutación/error, no uno compartido entre filas.
export function SupplierRowActions({
  supplier,
  onEdit,
}: SupplierRowActionsProps) {
  const deactivateSupplier = useDeactivateSupplier();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => onEdit(supplier)}
          className="px-3 py-1.5"
        >
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        {supplier.isActive && (
          <Button
            variant="ghost"
            onClick={() => deactivateSupplier.mutate(supplier.id)}
            disabled={deactivateSupplier.isPending}
            className="px-3 py-1.5"
          >
            <UserX className="h-4 w-4" />
            {deactivateSupplier.isPending ? 'Desactivando…' : 'Desactivar'}
          </Button>
        )}
      </div>
      {deactivateSupplier.isError && (
        <p className="text-danger max-w-48 text-right text-xs">
          {deactivateSupplier.error instanceof ApiError
            ? deactivateSupplier.error.message
            : 'No se pudo desactivar el proveedor.'}
        </p>
      )}
    </div>
  );
}
