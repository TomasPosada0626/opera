import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShoppingBag } from 'lucide-react';
import { z } from 'zod';
import { ProductPicker } from '../inventory/ProductPicker';
import { WarehouseSelect } from '../form/WarehouseSelect';
import { Button } from '../ui/Button';
import { useCreateSupplierPurchase } from '../../hooks/useCreateSupplierPurchase';
import { ApiError } from '../../lib/api-client';
import type { Product } from '../../types/product';

const purchaseSchema = z.object({
  warehouseId: z.string().min(1, 'Selecciona una bodega'),
  quantity: z
    .number({ message: 'Ingresa una cantidad' })
    .positive('Debe ser mayor a 0'),
  unitCost: z
    .number({ message: 'Ingresa un costo unitario' })
    .positive('Debe ser mayor a 0'),
  purchasedAt: z.string().optional(),
});
type PurchaseFormValues = z.infer<typeof purchaseSchema>;

interface SupplierPurchaseFormProps {
  supplierId: string;
  onSuccess: () => void;
}

// Bitácora manual — registrar la compra no mueve stock por sí sola (ver
// supplier-purchases.service.ts); mover stock real es un paso aparte,
// explícito, vía "Marcar como recibida" (#104-purchases). La fecha es
// opcional: si no se indica, el backend la marca "ahora" — útil para
// registrar una compra pasada.
export function SupplierPurchaseForm({
  supplierId,
  onSuccess,
}: SupplierPurchaseFormProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PurchaseFormValues>({ resolver: zodResolver(purchaseSchema) });
  const createSupplierPurchase = useCreateSupplierPurchase();

  function onSubmit(values: PurchaseFormValues) {
    if (!product) {
      setProductError('Selecciona un producto');
      return;
    }

    createSupplierPurchase.mutate(
      {
        supplierId,
        productId: product.id,
        warehouseId: values.warehouseId,
        quantity: values.quantity,
        unitCost: values.unitCost,
        purchasedAt: values.purchasedAt
          ? new Date(values.purchasedAt).toISOString()
          : undefined,
      },
      { onSuccess },
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <span className="text-ink-muted text-sm font-medium">Producto</span>
        <ProductPicker
          value={product}
          onChange={(next) => {
            setProduct(next);
            if (next) {
              setProductError(null);
            }
          }}
          error={productError ?? undefined}
        />
      </div>

      <WarehouseSelect
        registration={register('warehouseId')}
        error={errors.warehouseId}
        onAutoSelect={(id) => setValue('warehouseId', id)}
      />

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
            {...register('quantity', { valueAsNumber: true })}
            className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
          {errors.quantity && (
            <p className="text-danger text-xs">{errors.quantity.message}</p>
          )}
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
            {...register('unitCost', { valueAsNumber: true })}
            className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
          {errors.unitCost && (
            <p className="text-danger text-xs">{errors.unitCost.message}</p>
          )}
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
          {...register('purchasedAt')}
          className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
        />
      </div>

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
