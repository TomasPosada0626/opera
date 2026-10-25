import { useState, type FormEvent } from 'react';
import { Truck } from 'lucide-react';
import { FieldError, FormError } from '../form/Field';
import { Button } from '../ui/Button';
import { useCreateRemission } from '../../hooks/useCreateRemission';
import {
  formatMoney,
  formatQuantity,
  toDateInputValue,
} from '../../lib/format';
import { deliveredFor } from '../../lib/order-status';
import type { Order } from '../../types/order';
import { PaymentFields } from './PaymentFields';
import { toPaymentInput, type PaymentDraft } from '../../lib/payment-draft';

interface RemissionFormProps {
  order: Order;
  onSuccess: () => void;
}

// Despachar = elegir cuánto sale de cada línea. El pago al recibir es
// opcional (casi siempre se cobra después); si se marca, queda como el
// primer abono de la remisión y el estado de pago se calcula solo.
export function RemissionForm({ order, onSuccess }: RemissionFormProps) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [paidOnDelivery, setPaidOnDelivery] = useState(false);
  const [payment, setPayment] = useState<PaymentDraft>({
    amount: '',
    method: 'EFECTIVO',
    paidOn: toDateInputValue(new Date()),
    note: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const createRemission = useCreateRemission();

  const remissionTotal = order.items.reduce(
    (sum, item) =>
      sum + (Number(quantities[item.id]) || 0) * Number(item.unitPrice),
    0,
  );

  function dispatchEverything() {
    setQuantities(
      Object.fromEntries(
        order.items.map((item) => [
          item.id,
          String(Number(item.quantity) - deliveredFor(order, item.id)),
        ]),
      ),
    );
  }

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
          `${orderItem.product.name}: la cantidad excede lo pendiente por entregar (${formatQuantity(remaining)}).`,
        );
        return;
      }
      items.push({ orderItemId: orderItem.id, quantity });
    }

    if (items.length === 0) {
      setFormError('Ingresa una cantidad a entregar en al menos un producto.');
      return;
    }

    let initialPayment;
    if (paidOnDelivery) {
      const parsed = toPaymentInput(payment, remissionTotal);
      if (!parsed.ok) {
        setFormError(parsed.error);
        return;
      }
      initialPayment = parsed.value;
    }
    setFormError(null);

    createRemission.mutate(
      { orderId: order.id, items, initialPayment },
      { onSuccess },
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-ink-secondary text-[13px] font-medium">
            Qué sale en este despacho
          </span>
          <button
            type="button"
            onClick={dispatchEverything}
            className="text-accent hover:text-accent-hover text-[13px] font-medium transition-colors"
          >
            Despachar todo lo pendiente
          </button>
        </div>
        {order.items.map((orderItem) => {
          const delivered = deliveredFor(order, orderItem.id);
          const remaining = Number(orderItem.quantity) - delivered;

          return (
            <div
              key={orderItem.id}
              className="border-line bg-chrome/50 flex items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0">
                <p className="text-ink truncate text-sm font-medium">
                  {orderItem.product.sku} — {orderItem.product.name}
                </p>
                <p className="text-ink-muted text-xs">
                  Pendiente:{' '}
                  <span className="figures text-ink">
                    {formatQuantity(remaining)}
                  </span>{' '}
                  de {formatQuantity(orderItem.quantity)} ·{' '}
                  {formatMoney(orderItem.unitPrice)} c/u
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
                className="field figures h-9 w-24 shrink-0 px-3 text-right"
              />
            </div>
          );
        })}
        <div className="flex items-baseline justify-end gap-2 pt-1">
          <span className="text-ink-muted text-xs">Valor de la remisión</span>
          <span className="figures text-ink text-base font-semibold">
            {formatMoney(remissionTotal)}
          </span>
        </div>
      </div>

      <div className="border-line rounded-xl border">
        <div className="flex items-center gap-3 px-4 py-3">
          <input
            id="paidOnDelivery"
            type="checkbox"
            checked={paidOnDelivery}
            onChange={(event) => setPaidOnDelivery(event.target.checked)}
            className="accent-accent h-4 w-4 cursor-pointer"
          />
          <label
            htmlFor="paidOnDelivery"
            className="flex cursor-pointer flex-col"
          >
            <span className="text-ink text-sm font-medium">
              El cliente pagó al recibir
            </span>
            <span className="text-ink-muted text-xs">
              Si no, la remisión queda en cartera y el pago se registra después.
            </span>
          </label>
        </div>
        {paidOnDelivery && (
          <div className="border-line animate-fade-in border-t px-4 py-4">
            <PaymentFields
              idPrefix="remission-payment"
              value={payment}
              onChange={setPayment}
              max={remissionTotal}
            />
          </div>
        )}
      </div>

      <FieldError message={formError ?? undefined} />
      <FormError
        error={createRemission.error}
        fallback="No se pudo crear la remisión. Intenta de nuevo."
      />

      <Button type="submit" disabled={createRemission.isPending}>
        <Truck />
        {createRemission.isPending ? 'Creando…' : 'Crear remisión'}
      </Button>
    </form>
  );
}
