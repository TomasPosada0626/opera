import { useState, type FormEvent } from 'react';
import { PackageCheck } from 'lucide-react';
import { FieldError, FieldLabel, FormError } from '../form/Field';
import { Button } from '../ui/Button';
import { useReceivePurchaseOrder } from '../../hooks/usePurchaseOrderMutations';
import { formatQuantity, toDateInputValue } from '../../lib/format';
import { pendingQuantity } from '../../lib/purchase-status';
import type { PurchaseOrder } from '../../types/purchase-order';

interface ReceivePurchaseFormProps {
  order: PurchaseOrder;
  onSuccess: () => void;
}

// Recibir lo que llegó: cada línea arranca con todo lo que falta (el caso
// normal) y se baja si llegó menos. Lo que se deja en 0 no se recibe.
export function ReceivePurchaseForm({
  order,
  onSuccess,
}: ReceivePurchaseFormProps) {
  const pendingItems = order.items.filter((item) => pendingQuantity(item) > 0);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      pendingItems.map((item) => [item.id, String(pendingQuantity(item))]),
    ),
  );
  const [receivedOn, setReceivedOn] = useState(toDateInputValue(new Date()));
  const [formError, setFormError] = useState<string | null>(null);
  const receive = useReceivePurchaseOrder();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const items = [];
    for (const item of pendingItems) {
      const raw = quantities[item.id] ?? '';
      const quantity = Number(raw);
      if (raw === '' || quantity === 0) {
        continue;
      }
      if (!(quantity > 0) || quantity > pendingQuantity(item) + 1e-9) {
        setFormError(
          `De ${item.product.name} puedes recibir entre 0 y ${formatQuantity(pendingQuantity(item))}.`,
        );
        return;
      }
      items.push({ itemId: item.id, quantity });
    }
    if (items.length === 0) {
      setFormError('Indica cuánto llegó de al menos un producto.');
      return;
    }
    setFormError(null);
    receive.mutate(
      {
        id: order.id,
        items,
        // Mediodía local: lejos de la medianoche para que la zona horaria
        // no lo corra de día.
        receivedAt: new Date(`${receivedOn}T12:00:00`).toISOString(),
      },
      { onSuccess },
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <p className="text-ink-muted text-[13px] leading-5">
        Cada producto que recibas entra al inventario con el costo de esta
        compra.
      </p>

      <ul className="border-line divide-line divide-y rounded-xl border">
        {pendingItems.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-ink truncate text-sm font-medium">
                {item.product.name}
              </p>
              <p className="text-ink-faint text-xs">
                Faltan{' '}
                <span className="figures">
                  {formatQuantity(pendingQuantity(item))}
                </span>{' '}
                de{' '}
                <span className="figures">{formatQuantity(item.quantity)}</span>{' '}
                {item.product.unit.abbreviation}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                type="number"
                step="any"
                min="0"
                max={pendingQuantity(item)}
                aria-label={`Cantidad recibida de ${item.product.name}`}
                value={quantities[item.id] ?? ''}
                onChange={(event) =>
                  setQuantities((prev) => ({
                    ...prev,
                    [item.id]: event.target.value,
                  }))
                }
                className="field figures h-9 w-28 px-3 text-right"
              />
              <span className="text-ink-muted w-8 text-xs">
                {item.product.unit.abbreviation}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="receivedOn">Fecha de llegada</FieldLabel>
        <input
          id="receivedOn"
          type="date"
          max={toDateInputValue(new Date())}
          value={receivedOn}
          onChange={(event) => setReceivedOn(event.target.value)}
          className="field h-9 px-3"
        />
      </div>

      <FieldError message={formError ?? undefined} />
      <FormError
        error={receive.error}
        fallback="No se pudo registrar la recepción. Intenta de nuevo."
      />

      <Button type="submit" disabled={receive.isPending}>
        <PackageCheck />
        {receive.isPending ? 'Recibiendo…' : 'Recibir y sumar al inventario'}
      </Button>
    </form>
  );
}
