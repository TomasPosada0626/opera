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

// `isPortInUse()` usa `node:net` directo (no `spawn`) para probar el puerto
// del backend antes de levantarlo -- mockeado acá por el mismo motivo que
// `spawn`: un test no puede depender de si el puerto 3000 real de la
// máquina que corre el suite está libre o no.
const { netCreateServerMock } = vi.hoisted(() => ({
  netCreateServerMock: vi.fn(),
}));
vi.mock('node:net', () => ({
  createServer: netCreateServerMock,
  default: { createServer: netCreateServerMock },
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

// A diferencia de fakeCommand (el proceso corre y sale con un código), esto
// simula que `spawn` ni siquiera pudo lanzar el proceso -- el binario
// `docker` no está en el PATH (ENOENT), no que `docker info` haya fallado.
function fakeSpawnError(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  queueMicrotask(() => {
    child.emit('error', new Error('spawn docker ENOENT'));
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

// Controla qué "resultado" da la próxima prueba de puerto de
// `isPortInUse()` -- `true` (default en `beforeEach`) simula el puerto
// libre, para que el resto de los tests (que no le interesa este chequeo)
// no dependa de si el puerto 3000 real de la máquina del suite está libre.
function fakePortAvailable(available: boolean): void {
  netCreateServerMock.mockImplementation(() => {
    const tester = new EventEmitter() as EventEmitter & {
      listen: (port: number, host: string) => void;
      close: (cb: () => void) => void;
    };
    tester.listen = () => {
      queueMicrotask(() => {
        if (available) {
          tester.emit('listening');
        } else {
          tester.emit('error', new Error('EADDRINUSE'));
        }
      });
    };
    tester.close = (cb) => cb();
    return tester;
  });
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
    netCreateServerMock.mockReset();
    fakePortAvailable(true);
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

  // Rama sin cubrir señalada en la auditoría 2026-09-03 (ronda 3): los demás
  // tests simulan que `docker info` corre y sale con código no-cero, nunca
  // que `spawn` ni siquiera pudo lanzar el binario (docker no instalado / no
  // está en el PATH). El resultado visible es el mismo mensaje, pero es la
  // única rama de `docker()` que quedaba sin ejercitar.
  it('si el binario docker no existe (ENOENT), reporta el mismo error que si no estuviera corriendo', async () => {
    queueSpawns([fakeSpawnError]);

    const win = fakeWindow();
    initBackendManager(win);

    await vi.waitFor(() => {
      expect(lastStatusSent(win).state).toBe('error');
    });
    expect(lastStatusSent(win).message).toMatch(/Docker Desktop/);
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
      expect.arrayContaining(['run', '-d', '--name', 'opera-postgres-app']),
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
      ['start', 'opera-postgres-app'],
      undefined,
    );
  });

  it('genera el JWT_SECRET y la contraseña de Postgres una sola vez, y los persiste entre reinicios', async () => {
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
    ) as { jwtSecret: string; postgresPassword: string };
    expect(persisted.jwtSecret).toBe(firstSecret);
    expect(persisted.postgresPassword).toBeTruthy();
    // Regresión de la auditoría 2026-09-03 (ronda 3): antes era el literal
    // fijo 'opera' en toda instalación -- ahora tiene que ser aleatoria.
    expect(persisted.postgresPassword).not.toBe('opera');

    // El `docker run` que crea el contenedor (llamada 3 de las 6 de
    // happyPathSpawns) y el DATABASE_URL que arma el backend (llamada 6)
    // tienen que usar exactamente la misma contraseña recién generada.
    const dockerRunCall = spawnMock.mock.calls[2] as [string, string[]];
    expect(dockerRunCall[1]).toContain(
      `POSTGRES_PASSWORD=${persisted.postgresPassword}`,
    );
    expect(firstBackendCall[2].env.DATABASE_URL).toContain(
      `:${persisted.postgresPassword}@`,
    );

    // Reintento (simula un segundo arranque de la app) -- mismos secretos.
    spawnMock.mockClear();
    queueSpawns(happyPathSpawns({ containerExists: true }));
    await ipcHandler('backend:retry')();

    const secondBackendCall = spawnMock.mock.calls[5] as [
      string,
      string[],
      { env: Record<string, string> },
    ];
    expect(secondBackendCall[2].env.JWT_SECRET).toBe(firstSecret);
    expect(secondBackendCall[2].env.DATABASE_URL).toContain(
      `:${persisted.postgresPassword}@`,
    );
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
      ['stop', 'opera-postgres-app'],
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

  it('si `prisma migrate deploy` falla, reporta un mensaje genérico (el stderr crudo va al log, no a la UI) y nunca llega a spawnear el backend', async () => {
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
    // Regresión de la auditoría 2026-09-03 (ronda 3): el mensaje visible no
    // debe traer jerga/stderr de Prisma -- eso va aparte, a appendErrorLog.
    expect(lastStatusSent(win).message).not.toMatch(/P3009|migraciones/);
    expect(appendErrorLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'migrate-deploy-stderr',
        message: 'P3009 migración fallida',
      }),
    );
    expect(spawnMock).toHaveBeenCalledTimes(5);
  });

  // Ronda 2 de auditoría (2026-09-01), hallazgo P1 de testing: las 8 pruebas
  // de arriba siempre resuelven al primer intento -- nada cubría las ramas
  // de timeout/reintento real, que son justo las que importan cuando algo
  // sale mal en la PC de un usuario real.
  it('agota el timeout de Postgres si `pg_isready` nunca queda listo', async () => {
    vi.useFakeTimers();
    try {
      spawnMock.mockImplementation((_command: unknown, args: unknown) => {
        const argv = args as string[];
        if (argv[0] === 'info') return fakeCommand({ exitCode: 0 });
        if (argv[0] === 'inspect') return fakeCommand({ exitCode: 1 });
        if (argv[0] === 'run') return fakeCommand({ exitCode: 0 });
        if (argv.includes('pg_isready')) return fakeCommand({ exitCode: 1 });
        throw new Error(`spawn inesperado en este test: ${argv.join(' ')}`);
      });

      const win = fakeWindow();
      initBackendManager(win);

      await vi.advanceTimersByTimeAsync(31_000);

      expect(lastStatusSent(win)).toEqual({
        state: 'error',
        message: 'La base de datos no respondió a tiempo.',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('si el health check del backend rechaza (ECONNREFUSED simulado), sigue reintentando en vez de fallar de una', async () => {
    vi.useFakeTimers();
    try {
      const backendChild = fakeLongRunningProcess();
      queueSpawns(happyPathSpawns({ containerExists: false, backendChild }));

      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue(fakeResponse(true));
      vi.stubGlobal('fetch', fetchMock);

      const win = fakeWindow();
      initBackendManager(win);

      await vi.advanceTimersByTimeAsync(5_000);

      expect(lastStatusSent(win)).toEqual({ state: 'ready' });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('el stderr real del proceso del backend llega a appendErrorLog con type "backend-stderr"', async () => {
    const backendChild = fakeLongRunningProcess();
    queueSpawns(happyPathSpawns({ containerExists: false, backendChild }));
    const win = fakeWindow();
    initBackendManager(win);
    await vi.waitFor(() => {
      expect(lastStatusSent(win)).toEqual({ state: 'ready' });
    });

    backendChild.stderr.emit('data', Buffer.from('algo se rompió'));

    expect(appendErrorLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'backend-stderr',
        message: 'algo se rompió',
      }),
    );
  });

  it('backend:retry llamado mientras un start() anterior sigue en curso no deja dos backends corriendo a la vez', async () => {
    const firstBackend = fakeLongRunningProcess();
    const secondBackend = fakeLongRunningProcess();
    queueSpawns([
      ...happyPathSpawns({
        containerExists: false,
        backendChild: firstBackend,
      }),
      ...happyPathSpawns({
        containerExists: true,
        backendChild: secondBackend,
      }),
    ]);

    const win = fakeWindow();
    initBackendManager(win); // primer start(), todavía en curso

    // Encolado detrás del primero (nunca en paralelo) -- ver `startChain` en
    // backend-manager.ts.
    await ipcHandler('backend:retry')();

    expect(lastStatusSent(win)).toEqual({ state: 'ready' });
    expect(firstBackend.kill).toHaveBeenCalledWith('SIGTERM');
    expect(secondBackend.kill).not.toHaveBeenCalled();
  });

  // Hallazgo de arquitectura P2 (auditoría 2026-09-01, ronda 2): sin este
  // chequeo, un backend huérfano de una sesión anterior de Opera todavía
  // dueño del puerto 3000 se reportaba, 20 segundos después, como el mismo
  // mensaje genérico que cualquier otro timeout -- nada distinguía la causa
  // real.
  it('si el puerto del backend ya está ocupado, reporta un mensaje específico sin spawnear el backend', async () => {
    fakePortAvailable(false);
    queueSpawns([
      () => fakeCommand({ exitCode: 0 }), // docker info
      () => fakeCommand({ exitCode: 1 }), // docker inspect -> no existe
      () => fakeCommand({ exitCode: 0 }), // docker run
      () => fakeCommand({ exitCode: 0 }), // pg_isready
      () => fakeCommand({ exitCode: 0 }), // prisma migrate deploy
    ]);

    const win = fakeWindow();
    initBackendManager(win);

    await vi.waitFor(() => {
      expect(lastStatusSent(win).state).toBe('error');
    });
    expect(lastStatusSent(win).message).toMatch(
      /Ya hay otro programa usando el puerto/,
    );
    // Ni un spawn más allá de los 5 ya encolados -- nunca llegó a intentar
    // levantar el backend.
    expect(spawnMock).toHaveBeenCalledTimes(5);
  });
});
