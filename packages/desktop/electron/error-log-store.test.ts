import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mismo patrón que secure-token-store.test.ts/backend-manager.test.ts:
// fuera de un proceso Electron real, `electron` no existe.
let userDataDir = '';
const showSaveDialogMock = vi.fn();
vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  dialog: { showSaveDialog: showSaveDialogMock },
}));

const { appendErrorLog, exportErrorLog } = await import('./error-log-store');

function logFilePath(): string {
  return path.join(userDataDir, 'logs', 'opera-desktop.log');
}

describe('error-log-store', () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(path.join(os.tmpdir(), 'opera-error-log-'));
    showSaveDialogMock.mockReset();
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it('agrega cada entrada como una línea JSON con timestamp', () => {
    appendErrorLog({ source: 'main', type: 'backend-exit', message: 'boom' });

    const lines = readFileSync(logFilePath(), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as { time: string; message: string };
    expect(parsed.message).toBe('boom');
    expect(new Date(parsed.time).toString()).not.toBe('Invalid Date');
  });

  // Regresión de la auditoría 2026-09-01 (ronda 2): 5 MB/1 respaldo subió a
  // 10 MB/2 respaldos, con una rotación que ahora desplaza `.1` -> `.2` en
  // vez de solo pisar un único archivo -- sin test, un error de un solo
  // índice acá se pierde en silencio (nadie mira este archivo salvo cuando
  // algo ya salió mal).
  it('rota a .1 cuando el archivo supera el tamaño máximo', () => {
    const filePath = logFilePath();
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, 'x'.repeat(10 * 1024 * 1024));

    appendErrorLog({ source: 'main', type: 'backend-exit', message: 'nueva' });

    expect(existsSync(`${filePath}.1`)).toBe(true);
    const current = readFileSync(filePath, 'utf8').trim().split('\n');
    expect(current).toHaveLength(1);
    expect(JSON.parse(current[0]) as { message: string }).toMatchObject({
      message: 'nueva',
    });
  });

  it('desplaza .1 a .2 y borra el .2 anterior en vez de perder los dos respaldos', () => {
    const filePath = logFilePath();
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(`${filePath}.1`, 'respaldo-mas-reciente');
    writeFileSync(`${filePath}.2`, 'respaldo-mas-viejo-a-descartar');
    writeFileSync(filePath, 'x'.repeat(10 * 1024 * 1024));

    appendErrorLog({ source: 'main', type: 'backend-exit', message: 'nueva' });

    expect(readFileSync(`${filePath}.2`, 'utf8')).toBe('respaldo-mas-reciente');
    expect(readFileSync(`${filePath}.1`, 'utf8')).not.toBe(
      'respaldo-mas-reciente',
    );
  });

  it('no rota si el archivo todavía no llegó al tamaño máximo', () => {
    appendErrorLog({ source: 'renderer', type: 'x', message: 'chico' });
    appendErrorLog({ source: 'renderer', type: 'x', message: 'otro' });

    expect(existsSync(`${logFilePath()}.1`)).toBe(false);
  });

  it('exportErrorLog devuelve no-logs si todavía no se escribió nada', async () => {
    await expect(exportErrorLog()).resolves.toEqual({
      ok: false,
      reason: 'no-logs',
    });
  });

  it('exportErrorLog copia el archivo al destino elegido', async () => {
    appendErrorLog({ source: 'main', type: 'x', message: 'para exportar' });
    const destination = path.join(userDataDir, 'exported.log');
    showSaveDialogMock.mockResolvedValue({
      canceled: false,
      filePath: destination,
    });

    const result = await exportErrorLog();

    expect(result).toEqual({ ok: true, path: destination });
    expect(readFileSync(destination, 'utf8')).toContain('para exportar');
  });

  it('exportErrorLog devuelve canceled si la usuaria cierra el diálogo', async () => {
    appendErrorLog({ source: 'main', type: 'x', message: 'algo' });
    showSaveDialogMock.mockResolvedValue({ canceled: true });

    await expect(exportErrorLog()).resolves.toEqual({
      ok: false,
      reason: 'canceled',
    });
  });
});
