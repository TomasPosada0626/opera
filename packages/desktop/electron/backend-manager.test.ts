import { EventEmitter } from 'node:events';
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

let programDataDir = '';
const originalProgramData = process.env['ProgramData'];

function postgresSecretPath(): string {
  return path.join(programDataDir, 'Opera', 'postgres-secret.json');
}

// La mayoría de los tests no le interesa el aprovisionamiento de la
// contraseña de Postgres en sí (eso lo prueban los tests dedicados de más
// abajo) -- reflejan la situación real de producción, donde
// installer.nsh ya la dejó lista antes de que la app corriera por primera
// vez. Sembrarla acá evita que la mayoría de los tests existentes tengan
// que saber que ahora hay un spawn extra (`icacls`) cuando el
// aprovisionamiento sí ocurre.
function seedPostgresSecret(password = 'seeded-postgres-password'): void {
  mkdirSync(path.dirname(postgresSecretPath()), { recursive: true });
  writeFileSync(
    postgresSecretPath(),
    JSON.stringify({ postgresPassword: password }),
  );
}

describe('backend-manager', () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(path.join(os.tmpdir(), 'opera-secrets-'));
    programDataDir = mkdtempSync(path.join(os.tmpdir(), 'opera-programdata-'));
    process.env['ProgramData'] = programDataDir;
    seedPostgresSecret();
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
    rmSync(programDataDir, { recursive: true, force: true });
    if (originalProgramData === undefined) {
      delete process.env['ProgramData'];
    } else {
      process.env['ProgramData'] = originalProgramData;
    }
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

  it('genera el JWT_SECRET una sola vez (por perfil de Windows) y lo persiste entre reinicios', async () => {
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

  // Hallazgo transversal de la auditoría 2026-09-05 (ronda 4, encontrado por
  // Seguridad/Testing/Datos-Legal desde tres ángulos): la contraseña de
  // Postgres tiene que ser una sola por MÁQUINA (provisionada por
  // installer.nsh), no generada por esta app en cada perfil de Windows.
  describe('contraseña de Postgres (machine-wide, ver ProvisionPostgresSecret en installer.nsh)', () => {
    it('usa la contraseña ya provisionada por el instalador, no genera una nueva', async () => {
      seedPostgresSecret('la-que-puso-el-instalador');
      queueSpawns(happyPathSpawns({ containerExists: false }));

      const win = fakeWindow();
      initBackendManager(win);
      await vi.waitFor(() => {
        expect(lastStatusSent(win)).toEqual({ state: 'ready' });
      });

      // Sin icacls de más -- el archivo ya existía, solo se lee. Sigue
      // siendo exactamente 6 llamadas (las de happyPathSpawns).
      expect(spawnMock).toHaveBeenCalledTimes(6);
      const dockerRunCall = spawnMock.mock.calls[2] as [string, string[]];
      expect(dockerRunCall[1]).toContain(
        'POSTGRES_PASSWORD=la-que-puso-el-instalador',
      );
      const backendCall = spawnMock.mock.calls[5] as [
        string,
        string[],
        { env: Record<string, string> },
      ];
      expect(backendCall[2].env.DATABASE_URL).toContain(
        ':la-que-puso-el-instalador@',
      );
    });

    it('si el archivo no existe y el contenedor tampoco, la autoprovisiona (dev/testing sin pasar por el instalador)', async () => {
      rmSync(path.dirname(postgresSecretPath()), {
        recursive: true,
        force: true,
      });
      queueSpawns([
        () => fakeCommand({ exitCode: 0 }), // docker info
        () => fakeCommand({ exitCode: 1 }), // docker inspect -> no existe
        () => fakeCommand({ exitCode: 0 }), // icacls (nuevo, restringe permisos)
        ...happyPathSpawns({ containerExists: false }).slice(2), // run, pg_isready, migrate, backend
      ]);

      const win = fakeWindow();
      initBackendManager(win);
      await vi.waitFor(() => {
        expect(lastStatusSent(win)).toEqual({ state: 'ready' });
      });

      expect(spawnMock).toHaveBeenNthCalledWith(
        3,
        'icacls',
        expect.arrayContaining([postgresSecretPath(), '/inheritance:r']),
        undefined,
      );
      const persisted = JSON.parse(
        readFileSync(postgresSecretPath(), 'utf-8'),
      ) as { postgresPassword: string };
      expect(persisted.postgresPassword).toBeTruthy();
      const dockerRunCall = spawnMock.mock.calls[3] as [string, string[]];
      expect(dockerRunCall[1]).toContain(
        `POSTGRES_PASSWORD=${persisted.postgresPassword}`,
      );
    });

    it('si el contenedor ya existe pero no hay contraseña guardada, falla con un mensaje distinguible en vez de generar una nueva', async () => {
      rmSync(path.dirname(postgresSecretPath()), {
        recursive: true,
        force: true,
      });
      queueSpawns([
        () => fakeCommand({ exitCode: 0 }), // docker info
        () => fakeCommand({ exitCode: 0 }), // docker inspect -> SÍ existe
      ]);

      const win = fakeWindow();
      initBackendManager(win);

      await vi.waitFor(() => {
        expect(lastStatusSent(win).state).toBe('error');
      });
      expect(lastStatusSent(win).message).toMatch(
        /no se pudo autenticar con la base de datos existente/i,
      );
      // Nunca llega a `docker run`/`icacls` -- nada más que los dos checks.
      expect(spawnMock).toHaveBeenCalledTimes(2);
      expect(existsSync(postgresSecretPath())).toBe(false);
    });
  });

  // Hallazgo Datos/Legal P2.2, auditoría 2026-09-05 (ronda 4): backup-db.ts
  // por sí solo apuntaba al contenedor de dev por defecto y nada lo
  // disparaba nunca en la app empaquetada -- estos tests cubren el
  // disparador automático agregado acá (runBackupIfDue/BACKUP_CHECK_INTERVAL_MS).
  describe('backups automáticos mientras la app sigue abierta', () => {
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

    function backupScriptPath(): string {
      return path.join(
        userDataDir,
        'resources',
        'backend',
        'dist',
        'scripts',
        'backup-db.js',
      );
    }

    function lastBackupMarkerPath(): string {
      return path.join(programDataDir, 'Opera', 'last-backup-at.txt');
    }

    it('corre un backup 6 horas después de un arranque exitoso, con el contenedor y la carpeta correctos, y guarda cuándo', async () => {
      vi.useFakeTimers();
      try {
        queueSpawns([
          ...happyPathSpawns({ containerExists: false }),
          () => fakeCommand({ exitCode: 0 }), // backup-db.js
        ]);
        const win = fakeWindow();
        initBackendManager(win);

        await vi.advanceTimersByTimeAsync(SIX_HOURS_MS);

        expect(spawnMock).toHaveBeenCalledTimes(7);
        const backupCall = spawnMock.mock.calls[6] as [
          string,
          string[],
          { cwd: string; env: Record<string, string> },
        ];
        expect(backupCall[1]).toEqual([backupScriptPath()]);
        expect(backupCall[2].env.ELECTRON_RUN_AS_NODE).toBe('1');
        expect(backupCall[2].env.POSTGRES_CONTAINER).toBe('opera-postgres-app');
        expect(backupCall[2].env.OPERA_BACKUP_DIR).toBe(
          path.join(programDataDir, 'Opera', 'backups'),
        );

        const marker = readFileSync(lastBackupMarkerPath(), 'utf-8');
        expect(Number.isFinite(Date.parse(marker))).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('no repite el backup si ya corrió uno hace menos de 24 horas', async () => {
      vi.useFakeTimers();
      try {
        mkdirSync(path.dirname(lastBackupMarkerPath()), { recursive: true });
        writeFileSync(lastBackupMarkerPath(), new Date().toISOString());
        queueSpawns(happyPathSpawns({ containerExists: false }));
        const win = fakeWindow();
        initBackendManager(win);

        await vi.advanceTimersByTimeAsync(SIX_HOURS_MS);

        // Ninguno extra más allá de los 6 del arranque -- el chequeo de las
        // 6 horas encontró la marca reciente y no llegó a spawnear nada.
        expect(spawnMock).toHaveBeenCalledTimes(6);
      } finally {
        vi.useRealTimers();
      }
    });

    it('vuelve a respaldar si la última marca tiene más de 24 horas', async () => {
      vi.useFakeTimers();
      try {
        mkdirSync(path.dirname(lastBackupMarkerPath()), { recursive: true });
        writeFileSync(
          lastBackupMarkerPath(),
          new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        );
        queueSpawns([
          ...happyPathSpawns({ containerExists: false }),
          () => fakeCommand({ exitCode: 0 }),
        ]);
        const win = fakeWindow();
        initBackendManager(win);

        await vi.advanceTimersByTimeAsync(SIX_HOURS_MS);

        expect(spawnMock).toHaveBeenCalledTimes(7);
      } finally {
        vi.useRealTimers();
      }
    });

    it('si backup-db.js falla, lo deja en el log de errores y no actualiza la marca (reintenta en el próximo chequeo)', async () => {
      vi.useFakeTimers();
      try {
        queueSpawns([
          ...happyPathSpawns({ containerExists: false }),
          () =>
            fakeCommand({
              exitCode: 1,
              stderr: 'docker exec: contenedor no encontrado',
            }),
        ]);
        const win = fakeWindow();
        initBackendManager(win);

        await vi.advanceTimersByTimeAsync(SIX_HOURS_MS);

        expect(appendErrorLogMock).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'backup-db-stderr',
            message: 'docker exec: contenedor no encontrado',
          }),
        );
        expect(existsSync(lastBackupMarkerPath())).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
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

  // Observabilidad P2, auditoría 2026-09-05 (ronda 4): el stderr de Prisma
  // puede ecoar el DATABASE_URL completo (contraseña incluida) en errores de
  // conexión -- si eso llegara sin redactar al log de errores exportable,
  // deshacía por otra vía la protección de la contraseña machine-wide.
  it('redacta la contraseña de cualquier connection string de Postgres antes de loguearla', async () => {
    const stderrConContraseña =
      "Error P1001: Can't reach database server at `postgresql://opera:la-que-puso-el-instalador@127.0.0.1:5433/opera`";
    queueSpawns([
      () => fakeCommand({ exitCode: 0 }), // docker info
      () => fakeCommand({ exitCode: 1 }), // docker inspect -> no existe
      () => fakeCommand({ exitCode: 0 }), // docker run
      () => fakeCommand({ exitCode: 0 }), // pg_isready
      () => fakeCommand({ exitCode: 1, stderr: stderrConContraseña }), // migrate deploy
    ]);

    const win = fakeWindow();
    initBackendManager(win);

    await vi.waitFor(() => {
      expect(lastStatusSent(win).state).toBe('error');
    });
    const calls = appendErrorLogMock.mock.calls as [
      { type: string; message: string },
    ][];
    const loggedMessage = calls.find(
      ([entry]) => entry.type === 'migrate-deploy-stderr',
    )?.[0];
    if (!loggedMessage) {
      throw new Error('no se logueó ningún migrate-deploy-stderr');
    }
    expect(loggedMessage.message).not.toContain('la-que-puso-el-instalador');
    expect(loggedMessage.message).toContain(
      'postgresql://opera:***@127.0.0.1:5433/opera',
    );
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

  it('redacta la contraseña si el propio backend la imprime en su stderr', async () => {
    const backendChild = fakeLongRunningProcess();
    queueSpawns(happyPathSpawns({ containerExists: false, backendChild }));
    const win = fakeWindow();
    initBackendManager(win);
    await vi.waitFor(() => {
      expect(lastStatusSent(win)).toEqual({ state: 'ready' });
    });

    backendChild.stderr.emit(
      'data',
      Buffer.from(
        'DATABASE_URL=postgresql://opera:seeded-postgres-password@127.0.0.1:5433/opera',
      ),
    );

    expect(appendErrorLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'backend-stderr',
        message: 'DATABASE_URL=postgresql://opera:***@127.0.0.1:5433/opera',
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
