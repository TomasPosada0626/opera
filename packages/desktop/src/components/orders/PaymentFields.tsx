import { FieldLabel } from '../form/Field';
import { formatMoney, toDateInputValue } from '../../lib/format';
import { PAYMENT_METHOD_LABEL } from '../../lib/order-status';
import type { PaymentMethod } from '../../types/order';
import type { PaymentDraft } from '../../lib/payment-draft';

interface PaymentFieldsProps {
  idPrefix: string;
  value: PaymentDraft;
  onChange: (value: PaymentDraft) => void;
  // Lo máximo que se puede abonar (saldo pendiente o total de la remisión).
  max: number;
}

const METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[];

// Monto + medio + fecha + nota de un abono. Lo comparten la remisión
// (pago al recibir) y "Registrar abono" para que se capture igual en los
// dos lugares.
export function PaymentFields({
  idPrefix,
  value,
  onChange,
  max,
}: PaymentFieldsProps) {
  const update = (patch: Partial<PaymentDraft>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${idPrefix}-amount`}>Monto</FieldLabel>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="text-ink-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
              $
            </span>
            <input
              id={`${idPrefix}-amount`}
              type="number"
              step="any"
              min="0"
              max={max}
              placeholder="0"
              value={value.amount}
              onChange={(event) => update({ amount: event.target.value })}
              className="field figures h-9 w-full pr-3 pl-7"
            />
          </div>
          <button
            type="button"
            onClick={() => update({ amount: String(max) })}
            className="border-line-strong bg-surface-raised text-ink-secondary hover:text-ink hover:border-ink-faint/60 focus-visible:ring-accent h-9 shrink-0 rounded-lg border px-3 text-[13px] font-medium transition-all duration-200 outline-none focus-visible:ring-2 active:scale-[0.97]"
          >
            Todo · {formatMoney(max)}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${idPrefix}-method`}>Medio de pago</FieldLabel>
        <select
          id={`${idPrefix}-method`}
          value={value.method}
          onChange={(event) =>
            update({ method: event.target.value as PaymentMethod })
          }
          className="field h-9 px-3"
        >
          {METHODS.map((method) => (
            <option key={method} value={method}>
              {PAYMENT_METHOD_LABEL[method]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${idPrefix}-paidOn`}>Fecha del pago</FieldLabel>
        <input
          id={`${idPrefix}-paidOn`}
          type="date"
          max={toDateInputValue(new Date())}
          value={value.paidOn}
          onChange={(event) => update({ paidOn: event.target.value })}
          className="field h-9 px-3"
        />
      </div>
      <div className="col-span-2 flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${idPrefix}-note`} hint="opcional">
          Referencia
        </FieldLabel>
        <input
          id={`${idPrefix}-note`}
          type="text"
          maxLength={500}
          placeholder="N.º de transferencia, banco, quién recibió…"
          value={value.note}
          onChange={(event) => update({ note: event.target.value })}
          className="field h-9 px-3"
        />
      </div>
    </div>
  );
}
