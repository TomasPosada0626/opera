import { randomInt } from 'crypto';

// Alfabeto Crockford base32: sin I, L, O, U para que no se confundan con
// 1, 0 ni entre sí al copiarlo a mano de un papel. 16 caracteres x 5 bits
// = 80 bits — fuerza bruta impracticable incluso sin rate limit.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const GROUPS = 4;
const GROUP_LENGTH = 4;

// "7K2M-QX9D-4HPA-T3VR": cuatro grupos para leerlo y anotarlo cómodo.
export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let group = '';
    for (let i = 0; i < GROUP_LENGTH; i++) {
      group += ALPHABET[randomInt(0, ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

// Lo que se hashea y compara: sin guiones ni espacios, en mayúsculas, y con
// las letras ambiguas mapeadas a su dígito (como manda Crockford) — así
// "7k2m qx9d 4hpa t3vr" o una O escrita por un 0 siguen funcionando.
export function normalizeRecoveryCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}
