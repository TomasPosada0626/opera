import {
  formatRemissionNumber,
  parseRemissionNumber,
} from './remission-number';

describe('remission-number', () => {
  it('muestra el número con el prefijo del talonario', () => {
    expect(formatRemissionNumber(3285)).toBe('HT 3285');
  });

  it.each([
    ['HT 3285', 3285],
    ['ht 3285', 3285],
    ['HT3285', 3285],
    ['HT-3285', 3285],
    ['  3285  ', 3285],
    ['7', 7],
  ])('entiende "%s" como la remisión %i', (text, expected) => {
    expect(parseRemissionNumber(text)).toBe(expected);
  });

  it.each(['', 'HT', 'XX 3285', '32.85', 'HT 32a', '3285 HT', '-5'])(
    'no confunde "%s" con un número de remisión',
    (text) => {
      expect(parseRemissionNumber(text)).toBeNull();
    },
  );
});
