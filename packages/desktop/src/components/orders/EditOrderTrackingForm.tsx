import { useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { FieldLabel, FormError } from '../form/Field';
import { Button } from '../ui/Button';
import { useUpdateOrder } from '../../hooks/useUpdateOrder';
import type { Order } from '../../types/order';

interface EditOrderTrackingFormProps {
  order: Order;
  onSuccess: () => void;
}

// Solo lo que cambia mientras el pedido avanza (la fecha que se renegocia
// con el cliente, una nota de taller) — las líneas no se editan porque ya
// pueden tener stock y remisiones atados. El IVA sí, pero solo antes de la
// primera remisión: cada remisión guarda el IVA con el que se emitió.
export function EditOrderTrackingForm({
  order,
  onSuccess,
}: EditOrderTrackingFormProps) {
  const [date, setDate] = useState(
    order.estimatedDeliveryDate?.slice(0, 10) ?? '',
  );
  const [notes, setNotes] = useState(order.notes ?? '');
  const [vatRate, setVatRate] = useState(String(Number(order.vatRate)));
  const hasActiveRemissions = order.remissions.some(
    (remission) => remission.voidedAt === null,
  );
  const updateOrder = useUpdateOrder();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    updateOrder.mutate(
      {
        orderId: order.id,
        estimatedDeliveryDate: date || null,
        notes: notes.trim() || null,
        ...(hasActiveRemissions ? {} : { vatRate: Number(vatRate) }),
      },
      { onSuccess },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="trackingDate">Fecha de envío estimada</FieldLabel>
        <input
          id="trackingDate"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="field h-9 px-3"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="trackingVat">IVA</FieldLabel>
        <select
          id="trackingVat"
          value={vatRate}
          disabled={hasActiveRemissions}
          onChange={(event) => setVatRate(event.target.value)}
          className="field h-9 px-3 disabled:opacity-60"
        >
          <option value="19">Con IVA (19 %)</option>
          <option value="0">Sin IVA</option>
        </select>
        {hasActiveRemissions && (
          <p className="text-ink-muted text-xs">
            Ya tiene remisiones: el IVA quedó fijo en ellas.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="trackingNotes" hint={`${notes.length}/1000`}>
          Notas
        </FieldLabel>
        <textarea
          id="trackingNotes"
          rows={4}
          maxLength={1000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="field px-3 py-2"
        />
      </div>
      <FormError
        error={updateOrder.error}
        fallback="No se pudo guardar. Intenta de nuevo."
      />
      <Button type="submit" disabled={updateOrder.isPending}>
        <Save />
        {updateOrder.isPending ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  );
}
