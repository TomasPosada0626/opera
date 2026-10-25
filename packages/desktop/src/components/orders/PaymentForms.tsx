import { useState, type FormEvent } from 'react';
import { Ban, HandCoins } from 'lucide-react';
import { FieldError, FieldLabel, FormError } from '../form/Field';
import { Button } from '../ui/Button';
import {
  useAddRemissionPayment,
  useVoidRemissionPayment,
} from '../../hooks/useAddRemissionPayment';
import { formatMoney, toDateInputValue } from '../../lib/format';
import { PAYMENT_METHOD_LABEL } from '../../lib/order-status';
import type { Remission, RemissionPayment } from '../../types/order';
import { PaymentFields } from './PaymentFields';
import { toPaymentInput, type PaymentDraft } from '../../lib/payment-draft';

interface AddPaymentFormProps {
  orderId: string;
  remission: Remission;
  onSuccess: () => void;
}

// Registrar un abono: queda en el historial con su fecha y medio; el
// estado de pago (abonado/pagado) se recalcula en el backend.
export function AddPaymentForm({
  orderId,
  remission,
  onSuccess,
}: AddPaymentFormProps) {
  const pending = Number(remission.total) - Number(remission.amountPaid);
  const [payment, setPayment] = useState<PaymentDraft>({
    amount: '',
    method: 'TRANSFERENCIA',
    paidOn: toDateInputValue(new Date()),
    note: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const addPayment = useAddRemissionPayment();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = toPaymentInput(payment, pending);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    setFormError(null);
    addPayment.mutate(
      { remissionId: remission.id, orderId, ...parsed.value },
      { onSuccess },
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <dl className="border-line bg-chrome/50 grid grid-cols-3 gap-3 rounded-xl border p-4">
        {[
          ['Total', remission.total],
          ['Abonado', remission.amountPaid],
          ['Saldo', String(pending)],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-ink-muted text-[11px] font-semibold tracking-[0.08em] uppercase">
              {label}
            </dt>
            <dd
              className={`figures text-sm font-semibold ${
                label === 'Saldo' ? 'text-danger' : 'text-ink'
              }`}
            >
              {formatMoney(value)}
            </dd>
          </div>
        ))}
      </dl>

      <PaymentFields
        idPrefix="add-payment"
        value={payment}
        onChange={setPayment}
        max={pending}
      />

      <FieldError message={formError ?? undefined} />
      <FormError
        error={addPayment.error}
        fallback="No se pudo registrar el abono. Intenta de nuevo."
      />

      <Button type="submit" disabled={addPayment.isPending}>
        <HandCoins />
        {addPayment.isPending ? 'Registrando…' : 'Registrar abono'}
      </Button>
    </form>
  );
}

interface VoidPaymentFormProps {
  orderId: string;
  remissionId: string;
  payment: RemissionPayment;
  onSuccess: () => void;
}

// Anular un abono no lo borra: queda en el historial tachado, con el
// motivo, y deja de contar en lo abonado.
export function VoidPaymentForm({
  orderId,
  remissionId,
  payment,
  onSuccess,
}: VoidPaymentFormProps) {
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const voidPayment = useVoidRemissionPayment();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setFormError('Ingresa el motivo de la anulación (mínimo 3 caracteres).');
      return;
    }
    setFormError(null);
    voidPayment.mutate(
      { remissionId, paymentId: payment.id, orderId, reason: reason.trim() },
      { onSuccess },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-ink-muted text-sm">
        El abono de{' '}
        <span className="figures text-ink font-medium">
          {formatMoney(payment.amount)}
        </span>{' '}
        ({PAYMENT_METHOD_LABEL[payment.method]}) queda en el historial como
        anulado y deja de descontarse del saldo.
      </p>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="voidPaymentReason">Motivo</FieldLabel>
        <textarea
          id="voidPaymentReason"
          rows={3}
          placeholder="Transferencia rechazada, cheque devuelto, registrado dos veces…"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="field px-3 py-2"
        />
      </div>
      <FieldError message={formError ?? undefined} />
      <FormError
        error={voidPayment.error}
        fallback="No se pudo anular el abono. Intenta de nuevo."
      />
      <Button type="submit" variant="danger" disabled={voidPayment.isPending}>
        <Ban />
        {voidPayment.isPending ? 'Anulando…' : 'Anular abono'}
      </Button>
    </form>
  );
}
