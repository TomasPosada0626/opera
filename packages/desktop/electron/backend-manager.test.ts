import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `spawn` es el único punto de entrada a procesos reales que usa
// backend-manager.ts (docker info/inspect/run/start/exec, prisma migrate
// deploy, y el propio backend) -- se mockea una sola vez acá con `vi.hoisted`
// (corre antes que cualquier import de este archivo, igual que
// updater.test.ts hace con `electron-updater`) y cada test controla, en
// orden, qué "proceso" fake devuelve cada llamada.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  default: { spawn: spawnMock },
}));

let userDataDir = '';
vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  ipcMain: { handle: vi.fn() },
}));

const appendErrorLogMock = vi.fn();
vi.mock('./error-log-store', () => ({ appendErrorLog: appendErrorLogMock }));

const { ipcMain } = await import('electron');
const { initBackendManager, shutdownBackend } =
  await import('./backend-manager');

interface FakeChild extends EventEmitter {
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

// Simula un comando de vida corta (docker info/inspect/run/start/exec,
// prisma migrate deploy): sale solo, en el siguiente microtask.
function fakeCommand(
  options: { exitCode?: number | null; stderr?: string } = {},
): FakeChild {
  const { exitCode = 0, stderr = '' } = options;
  const child = new EventEmitter() as FakeChild;
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  queueMicrotask(() => {
    if (stderr) {
      child.stderr.emit('data', Buffer.from(stderr));
    }
    child.emit('exit', exitCode, null);
  });
  return child;
}

// Simula el proceso del backend real: nunca sale solo, solo cuando alguien
// le manda kill() (stopBackendProcess/shutdownBackend) -- necesario para
// distinguir una salida esperada de un crash real (ver `expectedExits` en
// backend-manager.ts).
function fakeLongRunningProcess(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => {
    queueMicrotask(() => child.emit('exit', null, 'SIGTERM'));
    return true;
  });
  return child;
}

function fakeResponse(ok: boolean): Response {
  return { ok } as unknown as Response;
}

function fakeWindow(): BrowserWindow {
  return { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
}

function ipcHandler(channel: string): () => Promise<unknown> {
  const call = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([registered]) => registered === channel);
  if (!call) {
    throw new Error(`No hay handler registrado para "${channel}"`);
  }
  return call[1] as () => Promise<unknown>;
}

// Encola, en orden, qué "proceso" devuelve cada llamada a `spawn` -- lanza
// si el código de producción llama a `spawn` más veces de las esperadas por
// el test, para no dejar pasar en silencio un comando extra sin cubrir.
function queueSpawns(factories: Array<() => FakeChild>): void {
  const queue = [...factories];
  spawnMock.mockImplementation(() => {
    const next = queue.shift();
    if (!next) {
      throw new Error('spawn() llamado más veces de las que el test encoló');
    }
    return next();
  });
}

function happyPathSpawns(options: {
  containerExists: boolean;
  backendChild?: FakeChild;
}): Array<() => FakeChild> {
  const backend = options.backendChild ?? fakeLongRunningProcess();
  return [
    () => fakeCommand({ exitCode: 0 }), // docker info
    () => fakeCommand({ exitCode: options.containerExists ? 0 : 1 }), // docker inspect
    () => fakeCommand({ exitCode: 0 }), // docker run | docker start
    () => fakeCommand({ exitCode: 0 }), // docker exec pg_isready
    () => fakeCommand({ exitCode: 0 }), // prisma migrate deploy
    () => backend, // el backend en sí (queda corriendo)
  ];
}

function lastStatusSent(win: BrowserWindow): BackendStatus {
  const calls = vi.mocked(win.webContents.send).mock.calls;
  const [, status] = calls[calls.length - 1] as [string, BackendStatus];
  return status;
}

describe('backend-manager', () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(path.join(os.tmpdir(), 'opera-secrets-'));
    // Solo existe dentro de un proceso Electron real (y es `readonly` en su
    // tipo, mismo motivo que main.test.ts usa `Object.defineProperty` para
    // `process.platform`) -- backendResourcesDir() lo necesita para ubicar
    // el backend/prisma empaquetados.
    Object.defineProperty(process, 'resourcesPath', {
      value: path.join(userDataDir, 'resources'),
      configurable: true,
    });
    spawnMock.mockReset();
    appendErrorLogMock.mockClear();
    vi.mocked(ipcMain.handle).mockClear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(true)));
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('si Docker Desktop no está corriendo, reporta error sin intentar nada más', async () => {
    queueSpawns([() => fakeCommand({ exitCode: 1 })]); // docker info falla

    const win = fakeWindow();
    initBackendManager(win);

    await vi.waitFor(() => {
      expect(lastStatusSent(win).state).toBe('error');
    });
    expect(lastStatusSent(win).message).toMatch(/Docker Desktop/);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('camino feliz: crea el contenedor, migra, levanta el backend y queda ready', async () => {
    queueSpawns(happyPathSpawns({ containerExists: false }));

    const win = fakeWindow();
    initBackendManager(win);

    await vi.waitFor(() => {
      expect(lastStatusSent(win)).toEqual({ state: 'ready' });
    });

    expect(spawnMock).toHaveBeenNthCalledWith(
      3,
      'docker',
      expect.arrayContaining(['run', '-d', '--name', 'opera-postgres']),
      undefined,
    );
  });

  it('reusa un contenedor existente con `docker start` en vez de `docker run`', async () => {
    queueSpawns(happyPathSpawns({ containerExists: true }));

    const win = fakeWindow();
    initBackendManager(win);

    await vi.waitFor(() => {
      expect(lastStatusSent(win)).toEqual({ state: 'ready' });
    });

    expect(spawnMock).toHaveBeenNthCalledWith(
      3,
      'docker',
      ['start', 'opera-postgres'],
      undefined,
    );
  });

  it('genera el JWT_SECRET una sola vez y lo persiste entre reinicios', async () => {
    queueSpawns(happyPathSpawns({ containerExists: false }));
    const win = fakeWindow();
    initBackendManager(win);
    await vi.waitFor(() => {
      expect(lastStatusSent(win)).toEqual({ state: 'ready' });
    });

    const firstBackendCall = spawnMock.mock.calls[5] as [
      string,
      string[],
      { env: Record<string, string> },
    ];
    const firstSecret = firstBackendCall[2].env.JWT_SECRET;
    expect(firstSecret).toBeTruthy();

    const persisted = JSON.parse(
      readFileSync(path.join(userDataDir, 'opera-secrets.json'), 'utf-8'),
    ) as { jwtSecret: string };
    expect(persisted.jwtSecret).toBe(firstSecret);

    // Reintento (simula un segundo arranque de la app) -- mismo secreto.
    spawnMock.mockClear();
    queueSpawns(happyPathSpawns({ containerExists: true }));
    await ipcHandler('backend:retry')();

    const secondBackendCall = spawnMock.mock.calls[5] as [
      string,
      string[],
      { env: Record<string, string> },
    ];
    expect(secondBackendCall[2].env.JWT_SECRET).toBe(firstSecret);
  });

  it('backend:retry vuelve a intentar y llega a ready después de un error', async () => {
    queueSpawns([() => fakeCommand({ exitCode: 1 })]); // docker info falla
    const win = fakeWindow();
    initBackendManager(win);
    await vi.waitFor(() => {
      expect(lastStatusSent(win).state).toBe('error');
    });

    queueSpawns(happyPathSpawns({ containerExists: false }));
    await ipcHandler('backend:retry')();

    expect(lastStatusSent(win)).toEqual({ state: 'ready' });
  });

  it('shutdownBackend mata el proceso del backend y para el contenedor', async () => {
    const backendChild = fakeLongRunningProcess();
    queueSpawns(happyPathSpawns({ containerExists: false, backendChild }));
    const win = fakeWindow();
    initBackendManager(win);
    await vi.waitFor(() => {
      expect(lastStatusSent(win)).toEqual({ state: 'ready' });
    });

    spawnMock.mockImplementationOnce(() => fakeCommand({ exitCode: 0 })); // docker stop
    await shutdownBackend();

    expect(backendChild.kill).toHaveBeenCalledWith('SIGTERM');
    expect(spawnMock).toHaveBeenLastCalledWith(
      'docker',
      ['stop', 'opera-postgres'],
      undefined,
    );
  });

  it('si el backend se cae solo (no por un stop pedido), reporta error', async () => {
    const backendChild = fakeLongRunningProcess();
    queueSpawns(happyPathSpawns({ containerExists: false, backendChild }));
    const win = fakeWindow();
    initBackendManager(win);
    await vi.waitFor(() => {
      expect(lastStatusSent(win)).toEqual({ state: 'ready' });
    });

    backendChild.emit('exit', 1, null);

    await vi.waitFor(() => {
      expect(lastStatusSent(win).state).toBe('error');
    });
    expect(appendErrorLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'backend-exit' }),
    );
  });

  it('si `prisma migrate deploy` falla, reporta error y nunca llega a spawnear el backend', async () => {
    queueSpawns([
      () => fakeCommand({ exitCode: 0 }), // docker info
      () => fakeCommand({ exitCode: 1 }), // docker inspect -> no existe
      () => fakeCommand({ exitCode: 0 }), // docker run
      () => fakeCommand({ exitCode: 0 }), // pg_isready
      () => fakeCommand({ exitCode: 1, stderr: 'P3009 migración fallida' }), // migrate deploy
    ]);

    const win = fakeWindow();
    initBackendManager(win);

    await vi.waitFor(() => {
      expect(lastStatusSent(win).state).toBe('error');
    });
    expect(lastStatusSent(win).message).toMatch(/migraciones/);
    expect(spawnMock).toHaveBeenCalledTimes(5);
  });
});
