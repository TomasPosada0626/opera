import { Pencil, UserX } from 'lucide-react';
import { Button } from '../ui/Button';
import { useDeactivateCustomer } from '../../hooks/useDeactivateCustomer';
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
  const deactivateCustomer = useDeactivateCustomer();

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
        {customer.isActive && (
          <Button
            variant="ghost"
            onClick={() => deactivateCustomer.mutate(customer.id)}
            disabled={deactivateCustomer.isPending}
            className="px-3 py-1.5"
          >
            <UserX className="h-4 w-4" />
            {deactivateCustomer.isPending ? 'Desactivando…' : 'Desactivar'}
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
    </div>
  );
}
