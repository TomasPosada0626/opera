import { Ban, Pencil } from 'lucide-react';
import { Button } from '../ui/Button';
import { useDeactivateProduct } from '../../hooks/useDeactivateProduct';
import { ApiError } from '../../lib/api-client';
import type { Product } from '../../types/product';

interface ProductRowActionsProps {
  product: Product;
  onEdit: (product: Product) => void;
}

export function ProductRowActions({ product, onEdit }: ProductRowActionsProps) {
  const deactivateProduct = useDeactivateProduct();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => onEdit(product)}
          className="px-3 py-1.5"
        >
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        {product.isActive && (
          <Button
            variant="ghost"
            onClick={() => deactivateProduct.mutate(product.id)}
            disabled={deactivateProduct.isPending}
            className="px-3 py-1.5"
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
