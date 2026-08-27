import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Factory } from 'lucide-react';
import { z } from 'zod';
import { ProductPicker } from '../inventory/ProductPicker';
import { WarehouseSelect } from '../form/WarehouseSelect';
import { Button } from '../ui/Button';
import { useCreateProductionOrder } from '../../hooks/useCreateProductionOrder';
import { ApiError } from '../../lib/api-client';
import type { Product } from '../../types/product';

const orderSchema = z.object({
  warehouseId: z.string().min(1, 'Selecciona una bodega'),
  quantity: z
    .number({ message: 'Ingresa una cantidad' })
    .positive('Debe ser mayor a 0'),
});

type OrderFormValues = z.infer<typeof orderSchema>;

interface ProductionOrderFormProps {
  onSuccess: () => void;
}

// El backend valida que el producto sea FINISHED_GOOD con receta activa y
// stock suficiente de materiales (400 con mensaje claro si no) — el
// formulario no duplica esa lógica, solo la muestra si falla.
export function ProductionOrderForm({ onSuccess }: ProductionOrderFormProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productError, setProductError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<OrderFormValues>({ resolver: zodResolver(orderSchema) });

  const createOrder = useCreateProductionOrder();

  function onSubmit(values: OrderFormValues) {
    if (!selectedProduct) {
      setProductError('Selecciona un producto');
      return;
    }

    createOrder.mutate(
      {
        productId: selectedProduct.id,
        warehouseId: values.warehouseId,
        quantity: values.quantity,
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
        <span className="text-ink-muted text-sm font-medium">
          Producto terminado
        </span>
        <ProductPicker
          value={selectedProduct}
          onChange={(product) => {
            setSelectedProduct(product);
            if (product) {
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

      <div className="flex flex-col gap-1">
        <label
          htmlFor="quantity"
          className="text-ink-muted text-sm font-medium"
        >
          Cantidad a producir
        </label>
        <input
          id="quantity"
          type="number"
          step="any"
          {...register('quantity', { valueAsNumber: true })}
          aria-invalid={!!errors.quantity}
          className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 aria-invalid:border-danger aria-invalid:focus:ring-danger/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
        />
        {errors.quantity && (
          <p className="text-danger text-xs">{errors.quantity.message}</p>
        )}
      </div>

      {createOrder.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {createOrder.error instanceof ApiError
            ? createOrder.error.message
            : 'No se pudo crear la orden. Intenta de nuevo.'}
        </p>
      )}

      <Button type="submit" disabled={createOrder.isPending} className="mt-1">
        <Factory className="h-4 w-4" />
        {createOrder.isPending ? 'Creando…' : 'Crear orden'}
      </Button>
    </form>
  );
}
