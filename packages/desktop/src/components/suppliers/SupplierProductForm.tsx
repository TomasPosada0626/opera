import { useState, type FormEvent } from 'react';
import { Tag } from 'lucide-react';
import { ProductPicker } from '../inventory/ProductPicker';
import { Button } from '../ui/Button';
import { useCreateSupplierProduct } from '../../hooks/useCreateSupplierProduct';
import { ApiError } from '../../lib/api-client';
import type { Product } from '../../types/product';

interface SupplierProductFormProps {
  supplierId: string;
  onSuccess: () => void;
}

// Lista de precios de referencia, no versionada — registrar un precio para
// un producto que ya tenía uno lo sobreescribe (ver
// supplier-products.service.ts), así que este mismo formulario sirve tanto
// para agregar como para actualizar un precio.
export function SupplierProductForm({
  supplierId,
  onSuccess,
}: SupplierProductFormProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [price, setPrice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const createSupplierProduct = useCreateSupplierProduct();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!product) {
      setFormError('Selecciona un producto');
      return;
    }
    const priceValue = Number(price);
    if (!priceValue || priceValue <= 0) {
      setFormError('Ingresa un precio mayor a 0');
      return;
    }
    setFormError(null);

    createSupplierProduct.mutate(
      { supplierId, productId: product.id, price: priceValue },
      { onSuccess },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-ink-muted text-sm font-medium">Producto</span>
        <ProductPicker value={product} onChange={setProduct} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="price" className="text-ink-muted text-sm font-medium">
          Precio
        </label>
        <input
          id="price"
          type="number"
          step="any"
          min="0"
          placeholder="0"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
        />
      </div>

      {formError && (
        <p role="alert" className="text-danger text-xs">
          {formError}
        </p>
      )}
      {createSupplierProduct.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {createSupplierProduct.error instanceof ApiError
            ? createSupplierProduct.error.message
            : 'No se pudo guardar el precio. Intenta de nuevo.'}
        </p>
      )}

      <Button
        type="submit"
        disabled={createSupplierProduct.isPending}
        className="mt-1"
      >
        <Tag className="h-4 w-4" />
        {createSupplierProduct.isPending ? 'Guardando…' : 'Guardar precio'}
      </Button>
    </form>
  );
}
