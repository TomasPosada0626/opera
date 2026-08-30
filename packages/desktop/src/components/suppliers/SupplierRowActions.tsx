import { useState } from 'react';
import { Eraser, Pencil, UserX } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useDeactivateSupplier } from '../../hooks/useDeactivateSupplier';
import { useAnonymizeSupplier } from '../../hooks/useAnonymizeSupplier';
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
  const [confirmingAnonymize, setConfirmingAnonymize] = useState(false);
  const deactivateSupplier = useDeactivateSupplier();
  const anonymizeSupplier = useAnonymizeSupplier();

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
        {supplier.isActive ? (
          <Button
            variant="ghost"
            onClick={() => deactivateSupplier.mutate(supplier.id)}
            disabled={deactivateSupplier.isPending}
            className="px-3 py-1.5"
          >
            <UserX className="h-4 w-4" />
            {deactivateSupplier.isPending ? 'Desactivando…' : 'Desactivar'}
          </Button>
        ) : (
          // Solo sobre un proveedor ya desactivado (#15, auditoría de
          // datos/legal) — borrar los datos personales es un paso legal
          // aparte de la decisión de negocio de desactivarlo.
          <Button
            variant="ghost"
            onClick={() => setConfirmingAnonymize(true)}
            className="px-3 py-1.5"
          >
            <Eraser className="h-4 w-4" />
            Borrar datos
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
      {confirmingAnonymize && (
        <ConfirmModal
          title="Borrar datos personales"
          message={`Esta acción borra de forma permanente el nombre, NIT, correo, teléfono y dirección de "${supplier.name}". El historial de compras se conserva. No se puede deshacer.`}
          isPending={anonymizeSupplier.isPending}
          error={
            anonymizeSupplier.isError
              ? anonymizeSupplier.error instanceof ApiError
                ? anonymizeSupplier.error.message
                : 'No se pudieron borrar los datos personales.'
              : undefined
          }
          onCancel={() => setConfirmingAnonymize(false)}
          onConfirm={() =>
            anonymizeSupplier.mutate(supplier.id, {
              onSuccess: () => setConfirmingAnonymize(false),
            })
          }
        />
      )}
    </div>
  );
}
