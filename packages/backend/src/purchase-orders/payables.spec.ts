import { Prisma } from '@prisma/client';
import {
  payableOf,
  receivedValueOf,
  supplierPaymentStatusFor,
} from './payables';

const d = (value: number) => new Prisma.Decimal(value);

describe('payables', () => {
  const items = [
    { quantityReceived: d(10), unitCost: d(500) },
    { quantityReceived: d(2.5), unitCost: d(1000) },
  ];

  it('values only what already arrived', () => {
    expect(receivedValueOf(items).toNumber()).toBe(7500);
    expect(receivedValueOf([]).toNumber()).toBe(0);
  });

  describe('supplierPaymentStatusFor', () => {
    it('does not apply to purchases migrated without payment tracking', () => {
      expect(
        supplierPaymentStatusFor({
          tracksPayment: false,
          total: d(100),
          amountPaid: d(0),
        }),
      ).toBe('NO_APLICA');
    });

    it.each([
      [0, 'PENDIENTE'],
      [40, 'ABONADA'],
      [100, 'PAGADA'],
    ])('with %s paid out of 100 it is %s', (paid, status) => {
      expect(
        supplierPaymentStatusFor({
          tracksPayment: true,
          total: d(100),
          amountPaid: d(paid),
        }),
      ).toBe(status);
    });

    it('a purchase worth nothing is pending, not paid', () => {
      expect(
        supplierPaymentStatusFor({
          tracksPayment: true,
          total: d(0),
          amountPaid: d(0),
        }),
      ).toBe('PENDIENTE');
    });
  });

  describe('payableOf', () => {
    const base = {
      tracksPayment: true,
      status: 'PARCIAL' as const,
      amountPaid: d(2000),
      items,
    };

    it('is what arrived minus what was paid', () => {
      expect(payableOf(base).toNumber()).toBe(5500);
    });

    it('never goes negative when the supplier was paid in advance', () => {
      expect(payableOf({ ...base, amountPaid: d(9000) }).toNumber()).toBe(0);
    });

    it('is zero for cancelled or untracked purchases', () => {
      expect(payableOf({ ...base, status: 'CANCELADA' }).toNumber()).toBe(0);
      expect(payableOf({ ...base, tracksPayment: false }).toNumber()).toBe(0);
    });
  });
});
