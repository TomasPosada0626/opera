import {
  generateRecoveryCode,
  normalizeRecoveryCode,
} from './recovery-code.util';

describe('recovery code', () => {
  it('generates four groups of four unambiguous characters', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  });

  it('does not repeat itself', () => {
    const codes = new Set(
      Array.from({ length: 50 }, () => generateRecoveryCode()),
    );
    expect(codes.size).toBe(50);
  });

  it('normalizes casing, separators and look-alike letters', () => {
    expect(normalizeRecoveryCode('7k2m qx9d-4hpa t3vr')).toBe(
      '7K2MQX9D4HPAT3VR',
    );
    expect(normalizeRecoveryCode('O0IL')).toBe('0011');
  });
});
