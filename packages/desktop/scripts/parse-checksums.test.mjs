import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// `parse-checksums.js` es CommonJS a propósito (mismo módulo que usa
// fetch-docker-installer.js) -- se importa con `require` real, no un
// `import` que Vitest reescribiría.
const { parseExpectedHash } = createRequire(import.meta.url)(
  './parse-checksums.js',
);

// Única lógica real de este script (el resto es descarga/verificación de
// red) -- parsea un archivo de texto de un tercero (checksums.txt de
// Docker), así que vale la pena cubrir el formato esperado y los que no.
describe('parseExpectedHash', () => {
  const HASH = 'a'.repeat(64);

  it('parsea el hash de una línea válida, sin importar mayúsculas', () => {
    const text = [
      `${'B'.repeat(64)} *Docker Desktop Installer for Windows.exe`,
      `${HASH.toUpperCase()} *Docker Desktop Installer.exe`,
    ].join('\n');

    expect(parseExpectedHash(text)).toBe(HASH);
  });

  it('tolera espacios y saltos de línea alrededor de cada entrada', () => {
    const text = `  \n  ${HASH} Docker Desktop Installer.exe  \n  `;

    expect(parseExpectedHash(text)).toBe(HASH);
  });

  it('lanza si ninguna línea corresponde al instalador de Windows', () => {
    const text = `${HASH} *Docker Desktop Installer.dmg`;

    expect(() => parseExpectedHash(text)).toThrow(
      /no tiene ninguna línea para/,
    );
  });

  it('lanza si la línea encontrada no trae un hash de 64 caracteres hex', () => {
    const text = 'not-a-hash *Docker Desktop Installer.exe';

    expect(() => parseExpectedHash(text)).toThrow(
      /No se pudo interpretar la línea de checksums/,
    );
  });
});
