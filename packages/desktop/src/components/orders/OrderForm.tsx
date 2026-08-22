import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, ShoppingCart, X } from 'lucide-react';
import { z } from 'zod';
import { ProductPicker } from '../inventory/ProductPicker';
import { Button } from '../ui/Button';
import { useCreateOrder } from '../../hooks/useCreateOrder';
import { useCustomers } from '../../hooks/useCustomers';
import { useWarehouses } from '../../hooks/useWarehouses';
import { ApiError } from '../../lib/api-client';
import type { Product } from '../../types/product';

const orderSchema = z.object({
  customerId: z.string().min(1, 'Selecciona un cliente'),
  warehouseId: z.string().min(1, 'Selecciona una bodega'),
});
type OrderFormValues = z.infer<typeof orderSchema>;

interface OrderLineDraft {
  key: string;
  product: Product | null;
  quantity: string;
  unitPrice: string;
}

function emptyLine(): OrderLineDraft {
  return {
    key: crypto.randomUUID(),
    product: null,
    quantity: '',
    unitPrice: '',
  };
}

interface OrderFormProps {
  onSuccess: () => void;
}

// Las líneas viven en estado local, no en react-hook-form — ProductPicker
// (#43) ya es un control externo con su propio estado/validación, no un
// input registrable; mismo motivo por el que ProductionOrderForm (#45)
// combina RHF (bodega/cantidad) con un ProductPicker suelto. Con varias
// líneas dinámicas, extender ese mismo patrón es más simple que forzar
// useFieldArray sobre un control que no lo necesita.
export function OrderForm({ onSuccess }: OrderFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OrderFormValues>({ resolver: zodResolver(orderSchema) });
  const [lines, setLines] = useState<OrderLineDraft[]>([emptyLine()]);
  const [linesError, setLinesError] = useState<string | null>(null);

  const customersQuery = useCustomers({ page: 1, pageSize: 100 });
  const warehousesQuery = useWarehouses();
  const createOrder = useCreateOrder();

  function updateLine(key: string, patch: Partial<OrderLineDraft>) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  function onSubmit(values: OrderFormValues) {
    if (lines.length === 0) {
      setLinesError('Agrega al menos un producto');
      return;
    }
    const items = [];
    for (const line of lines) {
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      if (
        !line.product ||
        !quantity ||
        quantity <= 0 ||
        !unitPrice ||
        unitPrice <= 0
      ) {
        setLinesError(
          'Completa producto, cantidad y precio (mayores a 0) en cada línea',
        );
        return;
      }
      items.push({ productId: line.product.id, quantity, unitPrice });
    }
    setLinesError(null);

    createOrder.mutate(
      { customerId: values.customerId, warehouseId: values.warehouseId, items },
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
        <label
          htmlFor="customerId"
          className="text-ink-muted text-sm font-medium"
        >
          Cliente
        </label>
        <select
          id="customerId"
          {...register('customerId')}
          className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 aria-invalid:border-danger aria-invalid:focus:ring-danger/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          aria-invalid={!!errors.customerId}
        >
          <option value="">Selecciona un cliente</option>
          {customersQuery.data?.data.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
        {errors.customerId && (
          <p className="text-danger text-xs">{errors.customerId.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="warehouseId"
          className="text-ink-muted text-sm font-medium"
        >
          Bodega
        </label>
        <select
          id="warehouseId"
          {...register('warehouseId')}
          className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 aria-invalid:border-danger aria-invalid:focus:ring-danger/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          aria-invalid={!!errors.warehouseId}
        >
          <option value="">Selecciona una bodega</option>
          {warehousesQuery.data?.data.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>
        {errors.warehouseId && (
          <p className="text-danger text-xs">{errors.warehouseId.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-ink-muted text-sm font-medium">Productos</span>
        {lines.map((line, index) => (
          <div
            key={line.key}
            className="border-line flex flex-col gap-2 rounded-md border p-3"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <ProductPicker
                  value={line.product}
                  onChange={(product) => updateLine(line.key, { product })}
                />
              </div>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  aria-label={`Quitar línea ${index + 1}`}
                  className="text-ink-muted hover:text-danger focus-visible:ring-accent shrink-0 rounded-md p-2 outline-none focus-visible:ring-2"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                min="0"
                placeholder="Cantidad"
                aria-label={`Cantidad línea ${index + 1}`}
                value={line.quantity}
                onChange={(event) =>
                  updateLine(line.key, { quantity: event.target.value })
                }
                className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
              />
              <input
                type="number"
                step="any"
                min="0"
                placeholder="Precio unitario"
                aria-label={`Precio unitario línea ${index + 1}`}
                value={line.unitPrice}
                onChange={(event) =>
                  updateLine(line.key, { unitPrice: event.target.value })
                }
                className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
              />
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setLines((prev) => [...prev, emptyLine()])}
          className="self-start"
        >
          <Plus className="h-4 w-4" />
          Agregar producto
        </Button>
        {linesError && (
          <p role="alert" className="text-danger text-xs">
            {linesError}
          </p>
        )}
      </div>

      {createOrder.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {createOrder.error instanceof ApiError
            ? createOrder.error.message
            : 'No se pudo crear el pedido. Intenta de nuevo.'}
        </p>
      )}

      <Button type="submit" disabled={createOrder.isPending} className="mt-1">
        <ShoppingCart className="h-4 w-4" />
        {createOrder.isPending ? 'Creando…' : 'Crear pedido'}
      </Button>
    </form>
  );
}
