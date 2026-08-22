import { useState, type FormEvent } from 'react';
import { Truck } from 'lucide-react';
import { Button } from '../ui/Button';
import { useCreateRemission } from '../../hooks/useCreateRemission';
import { ApiError } from '../../lib/api-client';
import type { Order } from '../../types/order';

interface RemissionFormProps {
  order: Order;
  onSuccess: () => void;
}

// Cuánto se ha entregado por línea se deriva de las remisiones ya incluidas
// en el pedido (ver orders.service.ts) — no hay un campo propio que leer.
function deliveredFor(order: Order, orderItemId: string): number {
  return order.remissions.reduce(
    (sum, remission) =>
      sum +
      remission.items
        .filter((item) => item.orderItemId === orderItemId)
        .reduce((lineSum, item) => lineSum + Number(item.quantity), 0),
    0,
  );
}

export function RemissionForm({ order, onSuccess }: RemissionFormProps) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const createRemission = useCreateRemission();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const items: { orderItemId: string; quantity: number }[] = [];
    for (const orderItem of order.items) {
      const raw = quantities[orderItem.id];
      if (!raw) {
        continue;
      }
      const quantity = Number(raw);
      if (quantity <= 0) {
        continue;
      }
      const remaining =
        Number(orderItem.quantity) - deliveredFor(order, orderItem.id);
      if (quantity > remaining) {
        setFormError(
          `${orderItem.product.name}: la cantidad excede lo pendiente por entregar (${remaining}).`,
        );
        return;
      }
      items.push({ orderItemId: orderItem.id, quantity });
    }

    if (items.length === 0) {
      setFormError('Ingresa una cantidad a entregar en al menos un producto.');
      return;
    }
    setFormError(null);

    createRemission.mutate({ orderId: order.id, items }, { onSuccess });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {order.items.map((orderItem) => {
          const delivered = deliveredFor(order, orderItem.id);
          const remaining = Number(orderItem.quantity) - delivered;

          return (
            <div
              key={orderItem.id}
              className="border-line flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="text-ink truncate text-sm font-medium">
                  {orderItem.product.sku} — {orderItem.product.name}
                </p>
                <p className="text-ink-muted text-xs">
                  Pendiente: {remaining} de {orderItem.quantity}
                </p>
              </div>
              <input
                type="number"
                step="any"
                min="0"
                max={remaining}
                disabled={remaining <= 0}
                placeholder="0"
                aria-label={`Cantidad a entregar de ${orderItem.product.name}`}
                value={quantities[orderItem.id] ?? ''}
                onChange={(event) =>
                  setQuantities((prev) => ({
                    ...prev,
                    [orderItem.id]: event.target.value,
                  }))
                }
                className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 w-24 shrink-0 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 disabled:opacity-50"
              />
            </div>
          );
        })}
      </div>

      {formError && (
        <p role="alert" className="text-danger text-xs">
          {formError}
        </p>
      )}
      {createRemission.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {createRemission.error instanceof ApiError
            ? createRemission.error.message
            : 'No se pudo crear la remisión. Intenta de nuevo.'}
        </p>
      )}

      <Button
        type="submit"
        disabled={createRemission.isPending}
        className="mt-1"
      >
        <Truck className="h-4 w-4" />
        {createRemission.isPending ? 'Creando…' : 'Crear remisión'}
      </Button>
    </form>
  );
}
