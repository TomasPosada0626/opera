import { useState } from 'react';
import { Eraser, Pencil, UserX } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useDeactivateCustomer } from '../../hooks/useDeactivateCustomer';
import { useAnonymizeCustomer } from '../../hooks/useAnonymizeCustomer';
import { ApiError } from '../../lib/api-client';
import type { Customer } from '../../types/customer';

interface CustomerRowActionsProps {
  customer: Customer;
  onEdit: (customer: Customer) => void;
}

// Desactivar vive en su propia fila (no en la página), mismo motivo que
// CompleteOrderAction (#45): cada botón necesita su propio estado de
// mutación/error, no uno compartido entre todas las filas de la tabla.
export function CustomerRowActions({
  customer,
  onEdit,
}: CustomerRowActionsProps) {
  const [confirmingAnonymize, setConfirmingAnonymize] = useState(false);
  const deactivateCustomer = useDeactivateCustomer();
  const anonymizeCustomer = useAnonymizeCustomer();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => onEdit(customer)}
          className="px-3 py-1.5"
        >
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        {customer.isActive ? (
          <Button
            variant="ghost"
            onClick={() => deactivateCustomer.mutate(customer.id)}
            disabled={deactivateCustomer.isPending}
            className="px-3 py-1.5"
          >
            <UserX className="h-4 w-4" />
            {deactivateCustomer.isPending ? 'Desactivando…' : 'Desactivar'}
          </Button>
        ) : (
          // Solo sobre un cliente ya desactivado (#15, auditoría de
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
      {deactivateCustomer.isError && (
        <p className="text-danger max-w-48 text-right text-xs">
          {deactivateCustomer.error instanceof ApiError
            ? deactivateCustomer.error.message
            : 'No se pudo desactivar el cliente.'}
        </p>
      )}
      {confirmingAnonymize && (
        <ConfirmModal
          title="Borrar datos personales"
          message={`Esta acción borra de forma permanente el nombre, NIT, correo, teléfono y dirección de "${customer.name}". El historial de pedidos se conserva. No se puede deshacer.`}
          isPending={anonymizeCustomer.isPending}
          error={
            anonymizeCustomer.isError
              ? anonymizeCustomer.error instanceof ApiError
                ? anonymizeCustomer.error.message
                : 'No se pudieron borrar los datos personales.'
              : undefined
          }
          onCancel={() => setConfirmingAnonymize(false)}
          onConfirm={() =>
            anonymizeCustomer.mutate(customer.id, {
              onSuccess: () => setConfirmingAnonymize(false),
            })
          }
        />
      )}
    </div>
  );
}
