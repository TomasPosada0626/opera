import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import { app, ipcMain, type BrowserWindow } from 'electron';
import { appendErrorLog, type LoggedError } from './error-log-store';

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
// la contraseña real vive en ensureMachineWidePostgresPassword() más abajo,
// deliberadamente NO junto al JWT_SECRET. Ver el comentario de esa función
// para el porqué completo (auditoría 2026-09-05, ronda 4).
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
// vive el secreto entre reinicios de la app. Deliberadamente por PERFIL de
// Windows (no por máquina): cada proceso de Electron solo necesita validar
// tokens que él mismo firmó, nunca cruza sesiones entre cuentas -- a
// diferencia de la contraseña de Postgres (ver más abajo), no hay ningún
// recurso compartido con el que este secreto tenga que coordinarse.
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

// Misma carpeta que installer.nsh resuelve (ver el comentario de
// ProvisionPostgresSecret ahí sobre por qué NO existe una constante NSIS
// para esto) -- `process.env.ProgramData` es la forma de leer esa misma
// ruta desde Node, con la misma cadena de respaldo, sin depender de ningún
// paquete nuevo.
function programDataDir(): string {
  return (
    process.env['ProgramData'] ??
    process.env['ALLUSERSPROFILE'] ??
    'C:\\ProgramData'
  );
}

function machineSecretPath(): string {
  return path.join(programDataDir(), 'Opera', 'postgres-secret.json');
}

// La contraseña real de Postgres tiene que ser UNA SOLA POR MÁQUINA,
// coordinada con el contenedor Docker (también por máquina, ver
// CONTAINER_NAME arriba) -- nunca por perfil de usuario de Windows, como
// se hizo en la ronda 3 (`opera-secrets.json` bajo `userData`). Postgres
// fija la contraseña una sola vez, en el `initdb` del volumen, la primera
// vez que se crea el contenedor; `docker start` en corridas posteriores
// nunca la vuelve a aplicar. Con la contraseña por perfil, tres auditores
// independientes (seguridad, testing, datos/legal) encontraron el mismo
// choque desde tres ángulos: una segunda cuenta de Windows en una PC
// compartida generaba la suya propia (rompía el caso de uso real del
// proyecto), actualizar desde una versión anterior regeneraba una que no
// coincidía con el volumen viejo, y un archivo corrupto dejaba el negocio
// sin poder acceder a su propio inventario/pedidos/clientes (auditoría
// 2026-09-05, ronda 4).
//
// `installer.nsh` ya provisiona este archivo -- con `icacls` restringiendo
// permisos -- ANTES de que exista ningún contenedor todavía (ver
// ProvisionPostgresSecret ahí). Este código es LECTOR en el camino normal;
// solo escribe si el contenedor TODAVÍA NO EXISTE (autoaprovisionamiento
// seguro para dev/testing corriendo win-unpacked/ directo, sin pasar por el
// instalador -- no hay ningún volumen con datos que se le pueda
// desincronizar). Si el contenedor YA existe pero el archivo no aparece,
// es la señal exacta de que se perdió la contraseña real -- ahí NUNCA se
// genera una nueva en silencio, porque dejaría la base inaccesible para
// siempre sin que nadie se entere hasta que ya sea tarde.
async function ensureMachineWidePostgresPassword(
  containerAlreadyExists: boolean,
): Promise<string> {
  const file = machineSecretPath();
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as {
        postgresPassword?: string;
      };
      if (parsed.postgresPassword) {
        return parsed.postgresPassword;
      }
    } catch {
      // Cae al mismo tratamiento que "no existe" de abajo.
    }
  }

  if (containerAlreadyExists) {
    throw new Error(
      'No se pudo autenticar con la base de datos existente -- puede que se haya perdido la contraseña guardada. Contactá soporte antes de seguir; no se va a generar una contraseña nueva automáticamente para no arriesgar el acceso a los datos ya guardados.',
    );
  }

  // Alfanumérica (sin +/=) para que entre sin escapar en la URL de conexión
  // (`postgresql://user:pass@...`) y en el argumento de `docker run` de
  // más abajo.
  const password = randomBytes(24).toString('base64url');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ postgresPassword: password }));
  await restrictToSystemAndAdmins(file);
  return password;
}

// Mismo patrón de permisos que installer.nsh ya usa para
// OperaSetupResume.exe: SYSTEM/Administradores con control total, cuentas
// locales comunes (Users, S-1-5-32-545) solo lectura -- necesitan poder
// leerlo para que Opera arranque en esa cuenta, pero no para modificarlo.
// Best-effort: si `icacls` falla, no es motivo para tumbar el arranque, el
// archivo sigue con los permisos que haya heredado la carpeta.
async function restrictToSystemAndAdmins(file: string): Promise<void> {
  try {
    await spawnAndWait('icacls', [
      file,
      '/inheritance:r',
      '/grant:r',
      '*S-1-5-18:(F)',
      '*S-1-5-32-544:(F)',
      '*S-1-5-32-545:(R)',
    ]);
  } catch {
    // best-effort, ver comentario de arriba.
  }
}

// Redacta cualquier contraseña embebida en una connection string de
// Postgres antes de que llegue al log de errores exportable -- ese archivo
// existe justo para mandarse por WhatsApp/correo cuando algo falla
// (error-log-store.ts), así que dejar pasar el stderr/mensaje crudo de
// Prisma (que puede ecoar el DATABASE_URL completo en errores de conexión)
// deshacía, por otra vía, la protección de la contraseña de arriba
// (auditoría 2026-09-05, ronda 4).
function redactConnectionStrings(text: string): string {
  return text.replace(/(postgresql:\/\/[^:]+:)[^@]+(@)/gi, '$1***$2');
}

function appendRedactedErrorLog(entry: LoggedError): void {
  appendErrorLog({
    ...entry,
    message: redactConnectionStrings(entry.message),
    stack: entry.stack ? redactConnectionStrings(entry.stack) : undefined,
  });
}

async function ensurePostgres(): Promise<string> {
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
  // Se resuelve ACÁ, no antes -- ensureMachineWidePostgresPassword()
  // necesita saber si el contenedor ya existe para decidir si autoprovisionar
  // es seguro o si hay que fallar con un mensaje distinguible (ver esa
  // función).
  const postgresPassword = await ensureMachineWidePostgresPassword(exists);
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

  return postgresPassword;
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
    // BackendStartupScreen.tsx (auditoría 2026-09-03, ronda 3). Redactado
    // (no `appendErrorLog` directo): un stderr de conexión de Prisma puede
    // ecoar el DATABASE_URL completo, contraseña incluida (auditoría
    // 2026-09-05, ronda 4).
    appendRedactedErrorLog({
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
//
// Si Electron muere de una forma que NUNCA llega a `shutdownBackend()`
// (crash real, "Finalizar tarea" desde el Administrador de tareas, corte de
// luz) este proceso queda huérfano, sin nadie que lo mate. Evaluado
// (auditoría 2026-09-05, ronda 4, Arquitectura, mejora) usar un Job Object
// de Windows (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) para que Windows mismo
// lo mate en cuanto el proceso de Electron termine, sin importar cómo --
// decisión consciente de NO hacerlo: Node no lo expone nativamente, exigiría
// sumar una dependencia nativa/FFI solo para este caso, y el escenario ya
// tiene una salida razonable sin eso -- `isPortInUse()` (más abajo) lo
// detecta en el arranque siguiente y el mensaje de error ya dice
// explícitamente "revisá también el Administrador de tareas". Si esto
// cambia de costo/beneficio (por ejemplo, si el huérfano deja de ser un
// evento raro), reconsiderar acá.
function startBackendProcess(env: Record<string, string>): void {
  setStatus({ state: 'starting', message: 'Iniciando Opera…' });
  const mainJsPath = path.join(backendResourcesDir(), 'dist', 'src', 'main.js');
  const child = spawn(process.execPath, [mainJsPath], {
    env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' },
  });
  backendProcess = child;

  child.stderr?.on('data', (chunk: Buffer) => {
    // Redactado: el propio backend real puede imprimir el DATABASE_URL en
    // sus logs de arranque de Nest/Prisma (auditoría 2026-09-05, ronda 4).
    appendRedactedErrorLog({
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
      appendRedactedErrorLog({
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
    // Cancelados en cuanto el proceso realmente sale (por el SIGTERM o,
    // más abajo, por el SIGKILL de refuerzo) -- sin esto, un proceso que sí
    // respondió a tiempo igual dejaba un `child.kill('SIGKILL')` fantasma
    // pendiente 5s después, reemitiendo un 'exit' de más sobre un proceso
    // que ya se había ido (y que `expectedExits` ya no reconocía, al ser un
    // WeakSet de un solo uso) -- se reportaba como caída inesperada sin
    // haber pasado nada.
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    let forceResolveTimer: ReturnType<typeof setTimeout> | null = null;
    child.once('exit', () => {
      if (killTimer) clearTimeout(killTimer);
      if (forceResolveTimer) clearTimeout(forceResolveTimer);
      resolve();
    });
    child.kill('SIGTERM');
    killTimer = setTimeout(() => {
      // Sigue vivo 5s después del SIGTERM -- no dejarlo huérfano dueño del
      // puerto. Antes, este mismo timeout solo resolvía la promesa sin
      // forzar nada: isPortInUse() (más abajo) sí detectaba el puerto
      // ocupado en el intento siguiente, pero el síntoma real era "hay que
      // reintentar a mano" en vez de resolverse solo (auditoría
      // 2026-09-05, ronda 4, Arquitectura P3).
      child.kill('SIGKILL');
      // Igual, nunca colgar a quien llama para siempre si ni el SIGKILL
      // llegara a producir un 'exit' -- mismo criterio de tope de antes,
      // corrido 2s más.
      forceResolveTimer = setTimeout(resolve, 2_000);
    }, 5_000);
  });
}

// Cada cuánto se FIJA de nuevo si corresponde un backup mientras la app
// sigue abierta. Deliberadamente NO atado al arranque/reintento de start()
// (que ya tiene su propia secuencia de spawns, cuidadosamente ordenada y
// testeada -- sumarle un spawn más ahí rompía esa cuenta en cada test
// existente del archivo) ni a un intervalo corto: un backup no es
// startup-crítico, y 6 horas alcanza para que un día de uso normal de
// horario comercial dispare al menos un chequeo. BACKUP_MIN_GAP_MS es quien
// realmente decide si corresponde repetir el backup, no este intervalo.
const BACKUP_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
// No repetir un backup si el último se completó hace menos de esto -- evita
// respaldar de más si la app queda abierta muchas horas seguidas.
const BACKUP_MIN_GAP_MS = 24 * 60 * 60 * 1000;

function backupDir(): string {
  return path.join(programDataDir(), 'Opera', 'backups');
}

function lastBackupMarkerPath(): string {
  return path.join(programDataDir(), 'Opera', 'last-backup-at.txt');
}

function backupScriptPath(): string {
  return path.join(backendResourcesDir(), 'dist', 'scripts', 'backup-db.js');
}

let backupInProgress = false;

// Corre packages/backend/scripts/backup-db.ts ya compilado, como proceso
// Node real -- mismo truco que runMigrations()/startBackendProcess()
// (ELECTRON_RUN_AS_NODE en vez de exigir un Node del sistema instalado).
// Se prefirió esto a una tarea de Windows programada por installer.nsh
// (que sí funciona para ScheduleResumeAndReboot): Docker Desktop corre en
// la sesión del usuario interactivo, y una tarea programada como SYSTEM
// (la única forma de correr sin depender de qué cuenta esté logueada) no
// tiene garantizado poder alcanzarlo -- hubiera arriesgado backups
// "programados" que en silencio nunca corren. Corriendo esto DENTRO del
// propio proceso de Electron mientras Opera está abierto, se comparte la
// misma sesión que ya sabemos que puede hablarle a Docker (auditoría
// 2026-09-05, ronda 4, Datos/Legal P2.2).
//
// Nunca relanza: una falla acá no debe tumbar Opera ni su UI, solo quedar
// en el log de diagnóstico -- un backup es una red de seguridad, no un
// requisito de arranque.
async function runBackupIfDue(): Promise<void> {
  if (backupInProgress) {
    return;
  }
  const marker = lastBackupMarkerPath();
  try {
    if (existsSync(marker)) {
      const lastRunAt = Date.parse(readFileSync(marker, 'utf-8').trim());
      if (
        Number.isFinite(lastRunAt) &&
        Date.now() - lastRunAt < BACKUP_MIN_GAP_MS
      ) {
        return;
      }
    }
  } catch {
    // Marcador corrupto -- se trata igual que "nunca hubo backup" y se
    // sigue abajo, no hay razón para bloquear el respaldo por esto.
  }

  backupInProgress = true;
  try {
    const { code, stderr } = await spawnAndWait(
      process.execPath,
      [backupScriptPath()],
      {
        cwd: backendResourcesDir(),
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          // El script asume por defecto el Postgres de DESARROLLO
          // (`opera-postgres`, ver DEFAULT_CONTAINER_NAME en
          // backup-db.ts) -- acá se pisa con el propio de esta app
          // empaquetada.
          POSTGRES_CONTAINER: CONTAINER_NAME,
          // El default del script (relativo a su propio archivo
          // compilado) cae dentro de resources/, que electron-builder
          // reemplaza entero en cada actualización -- un backup
          // "exitoso" ahí desaparecería con el próximo update.
          OPERA_BACKUP_DIR: backupDir(),
        },
      },
    );
    if (code !== 0) {
      appendRedactedErrorLog({
        source: 'main',
        type: 'backup-db-stderr',
        message: stderr,
      });
      return;
    }
    mkdirSync(path.dirname(marker), { recursive: true });
    writeFileSync(marker, new Date().toISOString());
  } catch (error) {
    appendRedactedErrorLog({
      source: 'main',
      type: 'backup-db-exception',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    backupInProgress = false;
  }
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
      const jwtSecret = ensureJwtSecret();
      const postgresPassword = await ensurePostgres();
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
      // Redactado como red de seguridad final -- ningún código de este
      // archivo debería embeber la contraseña en un Error.message hoy, pero
      // este es el único catch por el que pasa cualquier excepción futura
      // antes de mostrarse en la UI (setStatus) y guardarse en el log
      // exportable (auditoría 2026-09-05, ronda 4).
      const message = redactConnectionStrings(
        error instanceof Error ? error.message : String(error),
      );
      appendRedactedErrorLog({
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

let backupIntervalHandle: ReturnType<typeof setInterval> | null = null;

// Orquestado solo cuando !VITE_DEV_SERVER_URL (ver main.ts) -- en dev, el
// backend se levanta a mano de la forma de siempre.
export function initBackendManager(window: BrowserWindow): void {
  win = window;
  ipcMain.handle('backend:get-status', () => currentStatus);
  ipcMain.handle('backend:retry', () => start());
  void start();

  // `.unref()` -- no debe ser este timer quien mantenga vivo el proceso;
  // Electron ya tiene su propio ciclo de vida (ventanas, IPC) para eso.
  backupIntervalHandle = setInterval(() => {
    if (currentStatus.state === 'ready') {
      void runBackupIfDue();
    }
  }, BACKUP_CHECK_INTERVAL_MS).unref();
}

// Llamado desde el `window-all-closed` de main.ts antes de `app.quit()` --
// nunca deja Postgres ni el proceso del backend corriendo en segundo plano
// después de cerrar la ventana.
export async function shutdownBackend(): Promise<void> {
  if (backupIntervalHandle) {
    clearInterval(backupIntervalHandle);
    backupIntervalHandle = null;
  }
  await stopBackendProcess();
  await docker('stop', CONTAINER_NAME);
}
