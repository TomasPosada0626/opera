import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { app, ipcMain, type BrowserWindow } from 'electron';
import { appendErrorLog } from './error-log-store';

// Mismo contenedor/imagen/volumen/puerto que docker-compose.yml (dev) —
// nunca los dos al mismo tiempo en una misma máquina, pero comparten nombre
// a propósito para que `docker ps`/`docker volume ls` se lean igual en
// ambos contextos.
const CONTAINER_NAME = 'opera-postgres';
const POSTGRES_IMAGE = 'postgres:16';
const POSTGRES_VOLUME = 'opera_postgres_data';
const POSTGRES_USER = 'opera';
const POSTGRES_PASSWORD = 'opera';
const POSTGRES_DB = 'opera';
const POSTGRES_PORT = '5432';
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

function ensureJwtSecret(): string {
  const file = secretsFilePath();
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as {
        jwtSecret?: string;
      };
      if (parsed.jwtSecret) {
        return parsed.jwtSecret;
      }
    } catch {
      // Archivo corrupto -- se pisa con un secreto nuevo abajo en vez de
      // tumbar el arranque. Invalida cualquier sesión existente, pero eso
      // ya pasa igual cada vez que se genera un secreto nuevo.
    }
  }
  const jwtSecret = randomBytes(48).toString('base64');
  writeFileSync(file, JSON.stringify({ jwtSecret }));
  return jwtSecret;
}

async function ensurePostgres(): Promise<void> {
  setStatus({ state: 'starting', message: 'Comprobando Docker Desktop…' });
  if (!(await docker('info'))) {
    throw new Error(
      'Docker Desktop no está corriendo. Abrilo y volvé a intentar.',
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
      `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
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
  setStatus({ state: 'starting', message: 'Aplicando migraciones…' });
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
    throw new Error(`No se pudieron aplicar las migraciones: ${stderr}`);
  }
}

// No espera su salida a propósito -- corre en segundo plano mientras dure la
// sesión de Opera. Un `exit` inesperado (crash real, no el `SIGTERM` de
// stopBackendProcess) se reporta como error en vez de dejar la app colgada
// en "Iniciando Opera…" para siempre.
function startBackendProcess(env: Record<string, string>): void {
  setStatus({ state: 'starting', message: 'Iniciando el servidor…' });
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
        message: 'El servidor de Opera se detuvo inesperadamente.',
      });
    }
  });
}

async function waitForBackendHealth(): Promise<void> {
  setStatus({
    state: 'starting',
    message: 'Esperando a que el servidor esté listo…',
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
    'El servidor no respondió a tiempo.',
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

async function start(): Promise<void> {
  await stopBackendProcess();
  try {
    await ensurePostgres();
    const jwtSecret = ensureJwtSecret();
    const databaseUrl =
      `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}` +
      `@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}` +
      `?schema=public&connection_limit=10&pool_timeout=20`;
    await runMigrations(databaseUrl);
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
