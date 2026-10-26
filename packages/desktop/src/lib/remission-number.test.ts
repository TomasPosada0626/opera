import { describe, expect, it } from 'vitest';
import { formatRemissionNumber } from './remission-number';

describe('formatRemissionNumber', () => {
  it('muestra el número con el prefijo del talonario', () => {
    expect(formatRemissionNumber(3285)).toBe('HT 3285');
  });
});
