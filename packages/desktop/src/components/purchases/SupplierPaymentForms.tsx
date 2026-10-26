import { useState, type FormEvent } from 'react';
import { Ban, HandCoins } from 'lucide-react';
import { FieldError, FieldLabel, FormError } from '../form/Field';
import { Button } from '../ui/Button';
import { PaymentFields } from '../orders/PaymentFields';
import {
  useAddSupplierPayment,
  useVoidSupplierPayment,
} from '../../hooks/usePurchaseOrderMutations';
import { formatMoney, toDateInputValue } from '../../lib/format';
import { PAYMENT_METHOD_LABEL } from '../../lib/order-status';
import { toPaymentInput, type PaymentDraft } from '../../lib/payment-draft';
import type {
  PurchaseOrder,
  SupplierPayment,
} from '../../types/purchase-order';

interface AddSupplierPaymentFormProps {
  order: PurchaseOrder;
  onSuccess: () => void;
}

// Pago al proveedor. Se puede pagar lo recibido o adelantar hasta el total
// de la compra; el botón "Todo" propone lo que se debe de lo recibido si
// hay deuda, o el saldo de la compra si no.
export function AddSupplierPaymentForm({
  order,
  onSuccess,
}: AddSupplierPaymentFormProps) {
  const remaining = Number(order.total) - Number(order.amountPaid);
  const [payment, setPayment] = useState<PaymentDraft>({
    amount: '',
    method: 'TRANSFERENCIA',
    paidOn: toDateInputValue(new Date()),
    note: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const addPayment = useAddSupplierPayment();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = toPaymentInput(payment, remaining);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    setFormError(null);
    addPayment.mutate(
      { purchaseOrderId: order.id, ...parsed.value },
      { onSuccess },
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <dl className="border-line bg-chrome/50 grid grid-cols-3 gap-3 rounded-xl border p-4">
        {[
          ['Recibido', order.receivedValue, 'text-ink'],
          ['Pagado', order.amountPaid, 'text-success'],
          ['Por pagar', order.payable, 'text-danger'],
        ].map(([label, value, tone]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-ink-muted text-[11px] font-semibold tracking-[0.08em] uppercase">
              {label}
            </dt>
            <dd className={`figures text-sm font-semibold ${tone}`}>
              {formatMoney(value)}
            </dd>
          </div>
        ))}
      </dl>

      <PaymentFields
        idPrefix="supplier-payment"
        value={payment}
        onChange={setPayment}
        max={Number(order.payable) > 0 ? Number(order.payable) : remaining}
      />

      <FieldError message={formError ?? undefined} />
      <FormError
        error={addPayment.error}
        fallback="No se pudo registrar el pago. Intenta de nuevo."
      />

      <Button type="submit" disabled={addPayment.isPending}>
        <HandCoins />
        {addPayment.isPending ? 'Registrando…' : 'Registrar pago'}
      </Button>
    </form>
  );
}

interface VoidSupplierPaymentFormProps {
  orderId: string;
  payment: SupplierPayment;
  onSuccess: () => void;
}

export function VoidSupplierPaymentForm({
  orderId,
  payment,
  onSuccess,
}: VoidSupplierPaymentFormProps) {
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const voidPayment = useVoidSupplierPayment();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setFormError('Ingresa el motivo de la anulación (mínimo 3 caracteres).');
      return;
    }
    setFormError(null);
    voidPayment.mutate(
      {
        purchaseOrderId: orderId,
        paymentId: payment.id,
        reason: reason.trim(),
      },
      { onSuccess },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-ink-muted text-sm">
        El pago de{' '}
        <span className="figures text-ink font-medium">
          {formatMoney(payment.amount)}
        </span>{' '}
        ({PAYMENT_METHOD_LABEL[payment.method]}) queda en el historial como
        anulado y vuelve a contar como deuda.
      </p>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="voidSupplierPaymentReason">Motivo</FieldLabel>
        <textarea
          id="voidSupplierPaymentReason"
          rows={3}
          placeholder="Transferencia rechazada, registrado dos veces…"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="field px-3 py-2"
        />
      </div>
      <FieldError message={formError ?? undefined} />
      <FormError
        error={voidPayment.error}
        fallback="No se pudo anular el pago. Intenta de nuevo."
      />
      <Button type="submit" variant="danger" disabled={voidPayment.isPending}>
        <Ban />
        {voidPayment.isPending ? 'Anulando…' : 'Anular pago'}
      </Button>
    </form>
  );
}
