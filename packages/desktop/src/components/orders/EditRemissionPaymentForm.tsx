import { useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { Button } from '../ui/Button';
import { useUpdateRemissionPayment } from '../../hooks/useUpdateRemissionPayment';
import { ApiError } from '../../lib/api-client';
import type { Remission, RemissionPaymentStatus } from '../../types/order';

interface EditRemissionPaymentFormProps {
  orderId: string;
  remission: Remission;
  onSuccess: () => void;
}

const paymentStatusLabel: Record<RemissionPaymentStatus, string> = {
  PAGADO: 'Pagó el total',
  ABONADO: 'Abonó',
  CARTERA: 'Queda en cartera',
};

export function EditRemissionPaymentForm({
  orderId,
  remission,
  onSuccess,
}: EditRemissionPaymentFormProps) {
  const [paymentStatus, setPaymentStatus] = useState<RemissionPaymentStatus>(
    remission.paymentStatus,
  );
  const [amountPaid, setAmountPaid] = useState(remission.amountPaid ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const updatePayment = useUpdateRemissionPayment();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    let amountPaidValue: number | undefined;
    if (paymentStatus === 'ABONADO') {
      amountPaidValue = Number(amountPaid);
      if (!amountPaidValue || amountPaidValue <= 0) {
        setFormError('Ingresa cuánto abonó (mayor a 0).');
        return;
      }
    }
    setFormError(null);

    updatePayment.mutate(
      {
        remissionId: remission.id,
        orderId,
        paymentStatus,
        amountPaid: amountPaidValue,
      },
      { onSuccess },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="editPaymentStatus"
          className="text-ink-muted text-sm font-medium"
        >
          Estado de pago
        </label>
        <select
          id="editPaymentStatus"
          value={paymentStatus}
          onChange={(event) =>
            setPaymentStatus(event.target.value as RemissionPaymentStatus)
          }
          className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
        >
          {(Object.keys(paymentStatusLabel) as RemissionPaymentStatus[]).map(
            (status) => (
              <option key={status} value={status}>
                {paymentStatusLabel[status]}
              </option>
            ),
          )}
        </select>
      </div>

      {paymentStatus === 'ABONADO' && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="editAmountPaid"
            className="text-ink-muted text-sm font-medium"
          >
            Cuánto abonó
          </label>
          <input
            id="editAmountPaid"
            type="number"
            step="any"
            min="0"
            placeholder="0"
            value={amountPaid}
            onChange={(event) => setAmountPaid(event.target.value)}
            className="border-line bg-surface text-ink focus:border-accent focus:ring-accent/35 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
        </div>
      )}

      {formError && (
        <p role="alert" className="text-danger text-xs">
          {formError}
        </p>
      )}
      {updatePayment.isError && (
        <p
          role="alert"
          className="bg-danger-surface text-danger rounded-md px-3 py-2 text-sm"
        >
          {updatePayment.error instanceof ApiError
            ? updatePayment.error.message
            : 'No se pudo actualizar el pago. Intenta de nuevo.'}
        </p>
      )}

      <Button type="submit" disabled={updatePayment.isPending} className="mt-1">
        <Save className="h-4 w-4" />
        {updatePayment.isPending ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  );
}
