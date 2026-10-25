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
// pueden tener stock y remisiones atados.
export function EditOrderTrackingForm({
  order,
  onSuccess,
}: EditOrderTrackingFormProps) {
  const [date, setDate] = useState(
    order.estimatedDeliveryDate?.slice(0, 10) ?? '',
  );
  const [notes, setNotes] = useState(order.notes ?? '');
  const updateOrder = useUpdateOrder();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    updateOrder.mutate(
      {
        orderId: order.id,
        estimatedDeliveryDate: date || null,
        notes: notes.trim() || null,
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
