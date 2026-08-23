import { Ban, Pencil } from 'lucide-react';
import { Button } from '../ui/Button';
import { useDeactivateCategory } from '../../hooks/useDeactivateCategory';
import { ApiError } from '../../lib/api-client';
import type { Category } from '../../types/product';

interface CategoryRowActionsProps {
  category: Category;
  onEdit: (category: Category) => void;
}

export function CategoryRowActions({
  category,
  onEdit,
}: CategoryRowActionsProps) {
  const deactivateCategory = useDeactivateCategory();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => onEdit(category)}
          className="px-3 py-1.5"
        >
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        {category.isActive && (
          <Button
            variant="ghost"
            onClick={() => deactivateCategory.mutate(category.id)}
            disabled={deactivateCategory.isPending}
            className="px-3 py-1.5"
          >
            <Ban className="h-4 w-4" />
            {deactivateCategory.isPending ? 'Desactivando…' : 'Desactivar'}
          </Button>
        )}
      </div>
      {deactivateCategory.isError && (
        <p className="text-danger max-w-48 text-right text-xs">
          {deactivateCategory.error instanceof ApiError
            ? deactivateCategory.error.message
            : 'No se pudo desactivar la categoría.'}
        </p>
      )}
    </div>
  );
}
