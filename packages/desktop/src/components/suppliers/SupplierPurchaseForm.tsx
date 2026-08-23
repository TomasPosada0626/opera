import { useState, type FormEvent } from 'react';
import { ShoppingBag } from 'lucide-react';
import { ProductPicker } from '../inventory/ProductPicker';
import { Button } from '../ui/Button';
import { useCreateSupplierPurchase } from '../../hooks/useCreateSupplierPurchase';
import { ApiError } from '../../lib/api-client';
import type { Product } from '../../types/product';

interface SupplierPurchaseFormProps {
  supplierId: string;
  onSuccess: () => void;
}

// Bitácora manual — no mueve stock (ver supplier-purchases.service.ts), es
// solo seguimiento de gasto. La fecha es opcional: si no se indica, el
// backend la marca "ahora" — útil para registrar una compra pasada.
export function SupplierPurchaseForm({
  supplierId,
  onSuccess,
}: SupplierPurchaseFormProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [purchasedAt, setPurchasedAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const createSupplierPurchase = useCreateSupplierPurchase();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!product) {
      setFormError('Selecciona un producto');
      return;
    }
    const quantityValue = Number(quantity);
    if (!quantityValue || quantityValue <= 0) {
      setFormError('Ingresa una cantidad mayor a 0');
      return;
    }
    const unitCostValue = Number(unitCost);
    if (!unitCostValue || unitCostValue <= 0) {
      setFormError('Ingresa un costo unitario mayor a 0');
      return;
    }
    setFormError(null);

    createSupplierPurchase.mutate(
      {
        supplierId,
        productId: product.id,
        quantity: quantityValue,
        unitCost: unitCostValue,
        purchasedAt: purchasedAt
          ? new Date(purchasedAt).toISOString()
          : undefined,
      },
      { onSuccess },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-ink-muted text-sm font-medium">Producto</span>
        <ProductPicker value={product} onChange={setProduct} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="quantity"
            className="text-ink-muted text-sm font-medium"
          >
            Cantidad
          </label>
          <input
            id="quantity"
            type="number"
            step="any"
            min="0"
            placeholder="0"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="unitCost"
            className="text-ink-muted text-sm font-medium"
          >
            Costo unitario
          </label>
          <input
            id="unitCost"
            type="number"
            step="any"
            min="0"
            placeholder="0"
            value={unitCost}
            onChange={(event) => setUnitCost(event.target.value)}
            className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="purchasedAt"
          className="text-ink-muted text-sm font-medium"
        >
          Fecha (opcional, hoy si se deja vacío)
        </label>
        <input
          id="purchasedAt"
          type="date"
          value={purchasedAt}
          onChange={(event) => setPurchasedAt(event.target.value)}
          className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
        />
      </div>

      {formError && (
        <p role="alert" className="text-danger text-xs">
          {formError}
        </p>
      )}
      {createSupplierPurchase.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {createSupplierPurchase.error instanceof ApiError
            ? createSupplierPurchase.error.message
            : 'No se pudo registrar la compra. Intenta de nuevo.'}
        </p>
      )}

      <Button
        type="submit"
        disabled={createSupplierPurchase.isPending}
        className="mt-1"
      >
        <ShoppingBag className="h-4 w-4" />
        {createSupplierPurchase.isPending ? 'Guardando…' : 'Registrar compra'}
      </Button>
    </form>
  );
}
