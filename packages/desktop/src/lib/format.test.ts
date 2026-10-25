import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatMoneyCompact,
  formatQuantity,
  parseDateOnly,
  toDateInputValue,
  wholeDaysBetween,
} from './format';

describe('format', () => {
  it('formats Colombian pesos with the currency sign and no forced decimals', () => {
    expect(formatMoney('1250000')).toMatch(/\$\s?1\.250\.000/);
    expect(formatMoney(19.5)).toMatch(/\$\s?19,50$/);
    expect(formatMoney('4500.0000')).toMatch(/\$\s?4\.500$/);
  });

  it('treats null, undefined and garbage as zero', () => {
    expect(formatMoney(null)).toMatch(/\$\s?0/);
    expect(formatMoney(undefined)).toMatch(/\$\s?0/);
    expect(formatMoney('no es un número')).toMatch(/\$\s?0/);
  });

  it('abbreviates large amounts for KPIs', () => {
    expect(formatMoneyCompact('1250000')).toMatch(/1,3\s?M|1,2\s?M|mill/i);
  });

  it('formats quantities with up to three decimals', () => {
    expect(formatQuantity('2.5000')).toBe('2,5');
    expect(formatQuantity(1234)).toBe('1.234');
  });

  it('formats dates and date-times in Spanish', () => {
    expect(formatDate('2026-01-15T15:00:00.000Z')).toMatch(/2026/);
    expect(formatDateTime('2026-01-15T15:00:00.000Z')).toMatch(/ene/);
  });

  it('reads a date-only value without shifting it a day in UTC-5', () => {
    const date = parseDateOnly('2026-11-15T00:00:00.000Z');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(10);
    expect(date.getDate()).toBe(15);
    expect(formatDateOnly('2026-11-15T00:00:00.000Z')).toMatch(/15/);
  });

  it('builds the AAAA-MM-DD value of a local date', () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('counts whole days and never goes negative', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    expect(wholeDaysBetween('2026-01-07T13:00:00.000Z', now)).toBe(2);
    expect(wholeDaysBetween('2026-01-11T00:00:00.000Z', now)).toBe(0);
  });

  it('describes a duration in hours below a day and in days above', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    expect(formatDuration('2026-01-10T11:30:00.000Z', now)).toBe(
      'menos de 1 h',
    );
    expect(formatDuration('2026-01-10T07:00:00.000Z', now)).toBe('5 h');
    expect(formatDuration('2026-01-09T11:00:00.000Z', now)).toBe('1 día');
    expect(formatDuration('2026-01-01T12:00:00.000Z', now)).toBe('9 días');
  });
});
