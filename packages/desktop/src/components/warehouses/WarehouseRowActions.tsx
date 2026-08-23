import { Ban, Pencil } from 'lucide-react';
import { Button } from '../ui/Button';
import { useDeactivateWarehouse } from '../../hooks/useDeactivateWarehouse';
import { ApiError } from '../../lib/api-client';
import type { Warehouse } from '../../types/inventory';

interface WarehouseRowActionsProps {
  warehouse: Warehouse;
  onEdit: (warehouse: Warehouse) => void;
}

export function WarehouseRowActions({
  warehouse,
  onEdit,
}: WarehouseRowActionsProps) {
  const deactivateWarehouse = useDeactivateWarehouse();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => onEdit(warehouse)}
          className="px-3 py-1.5"
        >
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        {warehouse.isActive && (
          <Button
            variant="ghost"
            onClick={() => deactivateWarehouse.mutate(warehouse.id)}
            disabled={deactivateWarehouse.isPending}
            className="px-3 py-1.5"
          >
            <Ban className="h-4 w-4" />
            {deactivateWarehouse.isPending ? 'Desactivando…' : 'Desactivar'}
          </Button>
        )}
      </div>
      {deactivateWarehouse.isError && (
        <p className="text-danger max-w-48 text-right text-xs">
          {deactivateWarehouse.error instanceof ApiError
            ? deactivateWarehouse.error.message
            : 'No se pudo desactivar la bodega.'}
        </p>
      )}
    </div>
  );
}
