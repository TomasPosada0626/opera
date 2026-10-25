import { Ban, Layers, Pencil } from 'lucide-react';
import { Button } from '../ui/Button';
import { useDeactivateProduct } from '../../hooks/useDeactivateProduct';
import { ApiError } from '../../lib/api-client';
import type { Product } from '../../types/product';

interface ProductRowActionsProps {
  product: Product;
  onEdit: (product: Product) => void;
  // Solo para productos terminados: abre el editor de lista de materiales.
  onEditMaterials?: (product: Product) => void;
}

export function ProductRowActions({
  product,
  onEdit,
  onEditMaterials,
}: ProductRowActionsProps) {
  const deactivateProduct = useDeactivateProduct();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-1">
        {onEditMaterials && product.type === 'FINISHED_GOOD' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEditMaterials(product)}
          >
            <Layers className="h-4 w-4" />
            Materiales
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => onEdit(product)}>
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        {product.isActive && (
          <Button
            variant="ghost"
            onClick={() => deactivateProduct.mutate(product.id)}
            disabled={deactivateProduct.isPending}
            size="sm"
          >
            <Ban className="h-4 w-4" />
            {deactivateProduct.isPending ? 'Desactivando…' : 'Desactivar'}
          </Button>
        )}
      </div>
      {deactivateProduct.isError && (
        <p className="text-danger max-w-48 text-right text-xs">
          {deactivateProduct.error instanceof ApiError
            ? deactivateProduct.error.message
            : 'No se pudo desactivar el producto.'}
        </p>
      )}
    </div>
  );
}
