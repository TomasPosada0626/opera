import { formatMoney } from './format';
import type { PaymentMethod } from '../types/order';

// Borrador de un abono tal cual lo edita el formulario (todo string), y su
// conversión validada al body de la API. Separado de PaymentFields.tsx para
// que ese archivo solo exporte componentes (Fast Refresh de Vite).
export interface PaymentDraft {
  amount: string;
  method: PaymentMethod;
  // "AAAA-MM-DD" del <input type="date">.
  paidOn: string;
  note: string;
}

// Valida el borrador y lo convierte al body de la API. Devuelve un mensaje
// de error en vez de lanzar, para mostrarlo junto al formulario.
export function toPaymentInput(
  draft: PaymentDraft,
  max: number,
):
  | {
      ok: true;
      value: {
        amount: number;
        method: PaymentMethod;
        paidAt?: string;
        note?: string;
      };
    }
  | { ok: false; error: string } {
  const amount = Number(draft.amount);
  if (!amount || amount <= 0) {
    return { ok: false, error: 'Ingresa el monto del pago (mayor a 0).' };
  }
  if (amount > max + 1e-6) {
    return {
      ok: false,
      error: `El pago no puede superar ${formatMoney(max)}.`,
    };
  }
  // Mediodía local del día elegido: lejos de la medianoche para que la
  // zona horaria nunca lo corra al día anterior al guardarlo.
  const paidAt = draft.paidOn
    ? new Date(`${draft.paidOn}T12:00:00`).toISOString()
    : undefined;
  return {
    ok: true,
    value: {
      amount,
      method: draft.method,
      paidAt,
      note: draft.note.trim() || undefined,
    },
  };
}
