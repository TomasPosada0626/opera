// Herrajes Toro numera sus remisiones "HT 3286": el prefijo es de su
// talonario en papel, que Opera continúa (la migración
// 20261026180000_remisiones_desde_ht_3286 arranca el consecutivo ahí). En
// la base solo se guarda el número; el prefijo es cómo se muestra e
// imprime. Mismo formato en el escritorio: lib/remission-number.ts.
export const REMISSION_PREFIX = 'HT';

export function formatRemissionNumber(value: number): string {
  return `${REMISSION_PREFIX} ${value}`;
}

// Lo que alguien escribe para buscar una remisión: "HT 3285", "ht-3285",
// "HT3285" o solo "3285". Cualquier otra cosa no es un número de remisión.
export function parseRemissionNumber(text: string): number | null {
  const match = new RegExp(
    `^\\s*(?:${REMISSION_PREFIX}[\\s-]*)?(\\d{1,9})\\s*$`,
    'i',
  ).exec(text);
  return match ? Number(match[1]) : null;
}
