// Herrajes Toro numera sus remisiones "HT 3285" (el prefijo de su
// talonario en papel, que Opera continúa). En la base solo se guarda el
// número; esto es cómo se muestra e imprime. Mismo formato que el backend:
// packages/backend/src/remissions/remission-number.ts.
export const REMISSION_PREFIX = 'HT';

export function formatRemissionNumber(value: number): string {
  return `${REMISSION_PREFIX} ${value}`;
}
