import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import { app, ipcMain, type BrowserWindow } from 'electron';
import { appendErrorLog } from './error-log-store';

// Nombre/volumen/puerto DISTINTOS de los de `docker-compose.yml` (dev) --
// antes compartían nombre a propósito, pero eso significaba que abrir la
// app empaquetada en la misma PC donde ya existe (parada o corriendo) el
// Postgres de desarrollo la hacía reusar esa base sin darse cuenta
// (`docker inspect opera-postgres` la encontraba y `ensurePostgres()`
// arrancaba esa, no una propia) -- mezclando datos de dev con los de una
// instalación "real", o corriendo migraciones de un esquema adelantado
// contra el otro. Sufijo `-app` y puerto propio para que ni el nombre ni el
// puerto puedan colisionar nunca, sin importar qué esté corriendo en la
// máquina de quien desarrolla (auditoría 2026-09-01, ronda 2).
const CONTAINER_NAME = 'opera-postgres-app';
const POSTGRES_IMAGE = 'postgres:16';
const POSTGRES_VOLUME = 'opera_postgres_data_app';
// Usuario fijo (nunca sale de loopback, no hace falta que sea secreto) --
// la contraseña, en cambio, se genera una sola vez por instalación y se
// persiste junto al JWT_SECRET (ver ensureSecrets() más abajo). Antes era
// también fija ('opera'), asumiendo que el único riesgo real era un
// atacante con ejecución de código ya en la misma PC -- pero el caso de
// uso real de esta sesión es justo una PC COMPARTIDA (la de un familiar):
// cualquier otra cuenta de Windows en esa PC podía conectarse directo con
// pgAdmin/DBeaver a 127.0.0.1 y leer/escribir todo, saltándose RBAC y
// AuditLog por completo, sin necesitar ejecutar código malicioso alguno
// (auditoría 2026-09-03, ronda 3, datos/legal P2).
const POSTGRES_USER = 'opera';
const POSTGRES_DB = 'opera';
// 5433, no 5432 -- mismo motivo que el nombre del contenedor: si alguna vez
// coexisten (el Postgres de dev sigue corriendo mientras se prueba el
// instalador empaquetado en la misma PC), que compitan por el mismo puerto
// de loopback sería otra forma más de la misma colisión.
const POSTGRES_PORT = '5433';
const BACKEND_PORT = '3000';
const HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/health`;

const POSTGRES_READY_TIMEOUT_MS = 30_000;
const BACKEND_READY_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 1_000;

let win: BrowserWindow | null = null;
let currentStatus: BackendStatus = { state: 'starting' };
let backendProcess: ChildProcess | null = null;
// Marca qué procesos salieron porque `stopBackendProcess` los mató a
// propósito, identificados por instancia -- no alcanza con comparar contra
// `backendProcess` (que ya puede apuntar al proceso *siguiente* si el
// anterior tardó más de 5s en salir y el timeout de abajo ya resolvió).
const expectedExits = new WeakSet<ChildProcess>();

function setStatus(status: BackendStatus): void {
  currentStatus = status;
  win?.webContents.send('backend:status', status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(
  check: () => Promise<boolean>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() >= deadline) {
      throw new Error(timeoutMessage);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function spawnAndWait(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stderr }));
  });
}

async function docker(...args: string[]): Promise<boolean> {
  try {
    const { code } = await spawnAndWait('docker', args);
    return code === 0;
  } catch {
    return false;
  }
}

// `app.getPath('userData')/opera-secrets.json` en vez de un `.env` generado
// (ver NEXT_SESSION.md) — `env.ts` del backend no encuentra ningún `.env` en
// un build empaquetado y no hace nada, así que este es el único lugar donde
// vive el secreto entre reinicios de la app.
function secretsFilePath(): string {
  return path.join(app.getPath('userData'), 'opera-secrets.json');
}

interface Secrets {
  jwtSecret: string;
  postgresPassword: string;
}

// Ambos secretos viven en el mismo archivo -- se leen y regeneran juntos
// (nunca por separado) para que generar uno nunca pise al otro que ya
// existía. `postgresPassword` solo importa para el `docker run` inicial
// (Postgres fija la contraseña en el `initdb` del volumen la primera vez
// que se crea, ver ensurePostgres()); si el archivo se corrompe después de
// que el volumen ya existe con una contraseña vieja, seguir generando una
// nueva acá dejaría al backend sin poder conectarse -- caso límite aceptado
// por ahora, mismo criterio que ya se acepta para el JWT_SECRET (invalida
// sesiones existentes, no compromete datos).
function ensureSecrets(): Secrets {
  const file = secretsFilePath();
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(
        readFileSync(file, 'utf-8'),
      ) as Partial<Secrets>;
      if (parsed.jwtSecret && parsed.postgresPassword) {
        return {
          jwtSecret: parsed.jwtSecret,
          postgresPassword: parsed.postgresPassword,
        };
      }
    } catch {
      // Archivo corrupto -- se pisa con secretos nuevos abajo en vez de
      // tumbar el arranque.
    }
  }
  const secrets: Secrets = {
    jwtSecret: randomBytes(48).toString('base64'),
    // Alfanumérica (sin +/=) para que entre sin escapar en la URL de
    // conexión (`postgresql://user:pass@...`) y en el argumento de
    // `docker run` de más abajo.
    postgresPassword: randomBytes(24).toString('base64url'),
  };
  writeFileSync(file, JSON.stringify(secrets));
  return secrets;
}

async function ensurePostgres(postgresPassword: string): Promise<void> {
  setStatus({ state: 'starting', message: 'Comprobando Docker Desktop…' });
  if (!(await docker('info'))) {
    throw new Error(
      // Docker Desktop tarda en arrancar solo después de un reinicio de
      // Windows -- sin esta primera sugerencia, alguien que acaba de
      // reiniciar (p. ej. el propio instalador activando WSL) leía "abrí
      // Docker Desktop" como si algo estuviera mal, cuando en realidad solo
      // hacía falta esperar (auditoría 2026-09-01, ronda 2).
      'Docker Desktop no está corriendo. Si acabás de reiniciar la PC, esperá un minuto y volvé a intentar -- si el problema sigue, abrí Docker Desktop manualmente.',
    );
  }

  setStatus({ state: 'starting', message: 'Iniciando la base de datos…' });
  const exists = await docker('inspect', CONTAINER_NAME);
  if (exists) {
    await docker('start', CONTAINER_NAME);
  } else {
    await docker(
      'run',
      '-d',
      '--name',
      CONTAINER_NAME,
      '--restart',
      'unless-stopped',
      '-e',
      `POSTGRES_USER=${POSTGRES_USER}`,
      '-e',
      `POSTGRES_PASSWORD=${postgresPassword}`,
      '-e',
      `POSTGRES_DB=${POSTGRES_DB}`,
      '-p',
      `127.0.0.1:${POSTGRES_PORT}:5432`,
      '-v',
      `${POSTGRES_VOLUME}:/var/lib/postgresql/data`,
      POSTGRES_IMAGE,
    );
  }

  setStatus({
    state: 'starting',
    message: 'Esperando a que la base de datos esté lista…',
  });
  await waitUntil(
    () => docker('exec', CONTAINER_NAME, 'pg_isready', '-U', POSTGRES_USER),
    POSTGRES_READY_TIMEOUT_MS,
    'La base de datos no respondió a tiempo.',
  );
}

function backendResourcesDir(): string {
  return path.join(process.resourcesPath, 'backend');
}

async function runMigrations(databaseUrl: string): Promise<void> {
  // "Preparando la base de datos", no "aplicando migraciones" -- lenguaje
  // llano, cero vocabulario de desarrollador (auditoría 2026-09-01, ronda
  // 2, mismo criterio para el resto de los mensajes de setStatus() de este
  // archivo).
  setStatus({ state: 'starting', message: 'Preparando la base de datos…' });
  const prismaCli = path.join(
    backendResourcesDir(),
    'node_modules',
    'prisma',
    'build',
    'index.js',
  );
  const { code, stderr } = await spawnAndWait(
    process.execPath,
    [prismaCli, 'migrate', 'deploy'],
    {
      cwd: backendResourcesDir(),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DATABASE_URL: databaseUrl,
      },
    },
  );
  if (code !== 0) {
    // El stderr crudo de Prisma (rutas, códigos de error P1001/P3009, stack
    // traces) va al log de diagnóstico, no al mensaje que ve quien instala
    // -- meterlo en el Error.message rompía el propio criterio de "lenguaje
    // llano" de este archivo, porque ese mensaje sube tal cual hasta
    // BackendStartupScreen.tsx (auditoría 2026-09-03, ronda 3).
    appendErrorLog({
      source: 'main',
      type: 'migrate-deploy-stderr',
      message: stderr,
    });
    throw new Error(
      'No se pudo preparar la base de datos. Volvé a intentar; si el problema sigue, revisá el registro de errores desde Opera.',
    );
  }
}

// Chequeo previo, no reactivo al `spawn` en sí -- el backend real corre
// dentro de Nest, que ya loguea y sigue vivo (sin escuchar) ante un
// `EADDRINUSE` en vez de salir con un código distinguible. Detectarlo acá,
// antes de spawnear nada, evita que quien instala vea el mensaje genérico de
// "el servidor no respondió a tiempo" (BACKEND_READY_TIMEOUT_MS agotado)
// cuando la causa real es un backend huérfano de una sesión anterior de
// Opera que no cerró bien, todavía dueño del puerto (auditoría 2026-09-01,
// ronda 2).
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createServer();
    tester.once('error', () => resolve(true));
    tester.once('listening', () => tester.close(() => resolve(false)));
    tester.listen(port, '127.0.0.1');
  });
}

// No espera su salida a propósito -- corre en segundo plano mientras dure la
// sesión de Opera. Un `exit` inesperado (crash real, no el `SIGTERM` de
// stopBackendProcess) se reporta como error en vez de dejar la app colgada
// en "Iniciando Opera…" para siempre.
function startBackendProcess(env: Record<string, string>): void {
  setStatus({ state: 'starting', message: 'Iniciando Opera…' });
  const mainJsPath = path.join(backendResourcesDir(), 'dist', 'src', 'main.js');
  const child = spawn(process.execPath, [mainJsPath], {
    env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' },
  });
  backendProcess = child;

  child.stderr?.on('data', (chunk: Buffer) => {
    appendErrorLog({
      source: 'main',
      type: 'backend-stderr',
      message: chunk.toString(),
    });
  });
  child.on('exit', (code, signal) => {
    if (backendProcess === child) {
      backendProcess = null;
    }
    if (!expectedExits.delete(child)) {
      appendErrorLog({
        source: 'main',
        type: 'backend-exit',
        message: `El backend terminó inesperadamente (code=${code} signal=${signal})`,
      });
      setStatus({
        state: 'error',
        message: 'Opera se detuvo inesperadamente.',
      });
    }
  });
}

async function waitForBackendHealth(): Promise<void> {
  setStatus({
    state: 'starting',
    message: 'Esperando a que Opera esté listo…',
  });
  await waitUntil(
    async () => {
      try {
        const response = await fetch(HEALTH_URL);
        return response.ok;
      } catch {
        return false;
      }
    },
    BACKEND_READY_TIMEOUT_MS,
    'Opera no respondió a tiempo.',
  );
}

// Espera a que el proceso salga (con un tope, para no colgar un reintento o
// un cierre de la app si el backend no responde al SIGTERM) antes de que
// quien llama pueda spawnear uno nuevo en el mismo puerto.
function stopBackendProcess(): Promise<void> {
  const child = backendProcess;
  if (!child) {
    return Promise.resolve();
  }
  backendProcess = null;
  expectedExits.add(child);
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(resolve, 5_000);
  });
}

// Encadena las corridas de `start()` en vez de dejarlas correr en paralelo --
// `initBackendManager` dispara una al arrancar y `backend:retry` puede
// disparar otra mientras esa primera sigue en curso (el usuario reintenta
// apenas ve el error). Sin este encadenado, las dos podían llegar cada una a
// su propio `startBackendProcess()` y dejar dos backends reales corriendo a
// la vez, con `backendProcess` rastreando solo el último y el primero
// huérfano (nunca recibe `SIGTERM`).
let startChain: Promise<void> = Promise.resolve();

function start(): Promise<void> {
  const run = async (): Promise<void> => {
    await stopBackendProcess();
    try {
      const { jwtSecret, postgresPassword } = ensureSecrets();
      await ensurePostgres(postgresPassword);
      const databaseUrl =
        `postgresql://${POSTGRES_USER}:${postgresPassword}` +
        `@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}` +
        `?schema=public&connection_limit=10&pool_timeout=20`;
      await runMigrations(databaseUrl);
      if (await isPortInUse(Number(BACKEND_PORT))) {
        throw new Error(
          `Ya hay otro programa usando el puerto ${BACKEND_PORT}. Cerrá cualquier otra ventana de Opera abierta (revisá también el Administrador de tareas) y volvé a intentar.`,
        );
      }
      startBackendProcess({
        DATABASE_URL: databaseUrl,
        JWT_SECRET: jwtSecret,
        JWT_EXPIRES_IN: '1d',
        PORT: BACKEND_PORT,
        NODE_ENV: 'production',
        SWAGGER_ENABLED: 'false',
      });
      await waitForBackendHealth();
      setStatus({ state: 'ready' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendErrorLog({
        source: 'main',
        type: 'backend-manager',
        message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      setStatus({ state: 'error', message });
    }
  };

  const scheduled = startChain.then(run);
  // `startChain` siempre debe seguir resuelta -- si `run` fallara de forma
  // inesperada (no debería, atrapa todo arriba) no queremos que una
  // excepción no prevista deje encadenadas para siempre las corridas
  // futuras de `start()` sobre una promesa rechazada.
  startChain = scheduled.catch(() => {});
  return scheduled;
}

// Orquestado solo cuando !VITE_DEV_SERVER_URL (ver main.ts) -- en dev, el
// backend se levanta a mano de la forma de siempre.
export function initBackendManager(window: BrowserWindow): void {
  win = window;
  ipcMain.handle('backend:get-status', () => currentStatus);
  ipcMain.handle('backend:retry', () => start());
  void start();
}

// Llamado desde el `window-all-closed` de main.ts antes de `app.quit()` --
// nunca deja Postgres ni el proceso del backend corriendo en segundo plano
// después de cerrar la ventana.
export async function shutdownBackend(): Promise<void> {
  await stopBackendProcess();
  await docker('stop', CONTAINER_NAME);
}
