import { describe, expect, it } from 'vitest';
import { toPaymentInput } from './payment-draft';
import { auditActionLabel, auditEntityLabel } from './audit-labels';

describe('toPaymentInput', () => {
  const draft = {
    amount: '40',
    method: 'TRANSFERENCIA' as const,
    paidOn: '2026-01-20',
    note: '  Nequi  ',
  };

  it('rejects an empty or non-positive amount', () => {
    expect(toPaymentInput({ ...draft, amount: '' }, 100)).toEqual({
      ok: false,
      error: 'Ingresa el monto del pago (mayor a 0).',
    });
    expect(toPaymentInput({ ...draft, amount: '-5' }, 100).ok).toBe(false);
  });

  it('rejects more than the maximum allowed', () => {
    const result = toPaymentInput({ ...draft, amount: '150' }, 100);
    expect(result.ok).toBe(false);
  });

  it('builds the API body at local noon of the chosen day, trimming the note', () => {
    const result = toPaymentInput(draft, 100);
    expect(result).toEqual({
      ok: true,
      value: {
        amount: 40,
        method: 'TRANSFERENCIA',
        paidAt: new Date('2026-01-20T12:00:00').toISOString(),
        note: 'Nequi',
      },
    });
  });

  it('omits the date and an empty note', () => {
    const result = toPaymentInput({ ...draft, paidOn: '', note: ' ' }, 100);
    expect(result).toEqual({
      ok: true,
      value: {
        amount: 40,
        method: 'TRANSFERENCIA',
        paidAt: undefined,
        note: undefined,
      },
    });
  });
});

describe('audit labels', () => {
  it('translates known codes and passes unknown ones through', () => {
    expect(auditEntityLabel('Remission')).toBe('Remisión');
    expect(auditEntityLabel('Nuevo')).toBe('Nuevo');
    expect(auditActionLabel('ADD_PAYMENT')).toBe('registró un abono en');
    expect(auditActionLabel('SOMETHING_ELSE')).toBe('something_else');
  });
});
