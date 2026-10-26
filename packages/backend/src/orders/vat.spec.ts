import { Prisma } from '@prisma/client';
import { vatAmountFor } from './vat';

describe('vatAmountFor', () => {
  it('calcula el 19 % del subtotal', () => {
    expect(vatAmountFor(new Prisma.Decimal(100000), 19).toString()).toBe(
      '19000',
    );
  });

  it('es cero en un pedido sin IVA', () => {
    expect(vatAmountFor(new Prisma.Decimal(100000), 0).toString()).toBe('0');
  });

  it('redondea al centavo', () => {
    // 10,55 × 19 % = 2,0045 -> 2,00
    expect(vatAmountFor(new Prisma.Decimal('10.55'), 19).toString()).toBe('2');
    // 10,58 × 19 % = 2,0102 -> 2,01
    expect(vatAmountFor(new Prisma.Decimal('10.58'), 19).toString()).toBe(
      '2.01',
    );
  });

  it('acepta la tarifa como Decimal, tal como viene de la base', () => {
    expect(
      vatAmountFor(new Prisma.Decimal(50), new Prisma.Decimal(19)).toString(),
    ).toBe('9.5');
  });
});
