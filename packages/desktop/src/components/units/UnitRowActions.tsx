import { Ban, Pencil } from 'lucide-react';
import { Button } from '../ui/Button';
import { useDeactivateUnit } from '../../hooks/useDeactivateUnit';
import { ApiError } from '../../lib/api-client';
import type { Unit } from '../../types/product';

interface UnitRowActionsProps {
  unit: Unit;
  onEdit: (unit: Unit) => void;
}

export function UnitRowActions({ unit, onEdit }: UnitRowActionsProps) {
  const deactivateUnit = useDeactivateUnit();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => onEdit(unit)}
          className="px-3 py-1.5"
        >
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        {unit.isActive && (
          <Button
            variant="ghost"
            onClick={() => deactivateUnit.mutate(unit.id)}
            disabled={deactivateUnit.isPending}
            className="px-3 py-1.5"
          >
            <Ban className="h-4 w-4" />
            {deactivateUnit.isPending ? 'Desactivando…' : 'Desactivar'}
          </Button>
        )}
      </div>
      {deactivateUnit.isError && (
        <p className="text-danger max-w-48 text-right text-xs">
          {deactivateUnit.error instanceof ApiError
            ? deactivateUnit.error.message
            : 'No se pudo desactivar la unidad.'}
        </p>
      )}
    </div>
  );
}
