import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// `fetch-docker-installer.js` es CommonJS a propósito (mismo criterio que
// parse-checksums.js/retry.js) -- se importa con `require` real. El guard
// `require.main === module` del archivo evita que este `require` dispare
// una descarga real de red.
const { decideDownloadAction } = createRequire(import.meta.url)(
  './fetch-docker-installer.js',
);

// Única lógica de decisión real del resume por HTTP Range (el resto es
// sockets/streams reales, deliberadamente sin test -- ver retry.js/
// parse-checksums.js para el mismo criterio).
describe('decideDownloadAction', () => {
  it('sigue una redirección (3xx)', () => {
    expect(decideDownloadAction(301, 0)).toBe('redirect');
    expect(decideDownloadAction(302, 500)).toBe('redirect');
  });

  it('escribe de cero con 200 y nada descargado todavía', () => {
    expect(decideDownloadAction(200, 0)).toBe('write');
  });

  it('agrega al archivo parcial con 206 (el servidor honró el Range)', () => {
    expect(decideDownloadAction(206, 500)).toBe('append');
  });

  it('reinicia de cero si se pidió un Range pero el servidor mandó 200 igual (no soporta Range)', () => {
    expect(decideDownloadAction(200, 500)).toBe('restart');
  });

  it('reinicia de cero si el servidor responde 416 (offset ya no válido)', () => {
    expect(decideDownloadAction(416, 500)).toBe('restart');
  });

  it('no reinicia por un 416 si no se había descargado nada (no debería pasar, pero no debe entrar en loop)', () => {
    expect(decideDownloadAction(416, 0)).toBe('error');
  });

  it('cualquier otro código es un error', () => {
    expect(decideDownloadAction(404, 0)).toBe('error');
    expect(decideDownloadAction(500, 0)).toBe('error');
  });
});
