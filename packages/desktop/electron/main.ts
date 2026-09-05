import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { clearToken, readToken, writeToken } from './secure-token-store';
import {
  appendErrorLog,
  exportErrorLog,
  type LoggedError,
} from './error-log-store';
import { initAutoUpdater, restartAndInstall } from './updater';
import { initBackendManager, shutdownBackend } from './backend-manager';

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.APP_ROOT = path.join(__dirname, '..');

// 🚧 Use ['ENV_NAME'] to avoid the vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null;

// Mismo default que src/lib/api-client.ts — no hay un solo punto de verdad
// compartido entre el proceso principal y el renderer para esto, así que
// se repite a propósito en vez de importar a través del bundle del
// renderer.
const API_URL = process.env['VITE_API_URL'] ?? 'http://localhost:3000';

// Content-Security-Policy real (checklist de seguridad de Electron,
// encontrado en la revisión de cierre de M6). Solo en empaquetado: en dev,
// Vite HMR necesita 'unsafe-eval'/scripts inyectados que no vale la pena
// permitir también en producción. style-src necesita 'unsafe-inline'
// porque `Logo.tsx` calcula un tamaño de fuente dinámico vía `style={{}}`
// (un valor real, no una decoración) — script-src se queda estricto.
function applyContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self' data:",
            `connect-src 'self' ${API_URL}`,
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
          ].join('; '),
        ],
      },
    });
  });
}

function createWindow() {
  win = new BrowserWindow({
    title: 'Opera',
    // Sin esto, nada impedía redimensionar a un tamaño donde el layout con
    // sidebar se rompe (señalado en la auditoría 2026-08-28) — no es un
    // tamaño de ventana inicial, solo el piso al que se puede achicar.
    minWidth: 1024,
    minHeight: 640,
    // En empaquetado, win.icon (electron-builder.json5) ya deja el ícono
    // grabado en el .exe — esto además cubre `pnpm dev` (sin empaquetar,
    // corriendo directo contra Electron), donde si no se pasa nada aquí
    // se ve el ícono genérico de Electron en la barra de tareas.
    icon: path.join(process.env.VITE_PUBLIC, 'icon-256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Ya son el default desde Electron 20+/28+ — declarados a propósito
      // (señalado en la re-auditoría) para que el checklist de seguridad
      // (ver CSP arriba) sea auditable leyendo este archivo, sin depender
      // de que quien lo lea sepa de memoria cuáles son los defaults
      // actuales de la versión de Electron instalada.
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // La app nunca abre ventanas nuevas ni navega fuera de sí misma a
  // propósito — cualquier intento de hacerlo (un `target="_blank"` o un
  // `window.open` colado en algún texto renderizado, un link externo mal
  // manejado) se deniega en vez de abrir una ventana sin las protecciones
  // de esta (CSP, webPreferences) o navegar el proceso principal a un sitio
  // arbitrario (señalado en la re-auditoría).
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = VITE_DEV_SERVER_URL
      ? url.startsWith(VITE_DEV_SERVER_URL)
      : url.startsWith('file://');
    if (!allowed) {
      event.preventDefault();
    }
  });

  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

// Sin esto, un fallo fuera del ciclo normal de eventos (una promesa suelta,
// un renderer que se cae) no dejaba ningún rastro — igual que el gap que
// esto mismo cierra del lado del backend (nestjs-pino).
process.on('uncaughtException', (error) => {
  appendErrorLog({
    source: 'main',
    type: 'uncaughtException',
    message: error.message,
    stack: error.stack,
  });
});
process.on('unhandledRejection', (reason) => {
  appendErrorLog({
    source: 'main',
    type: 'unhandledRejection',
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

app.on('render-process-gone', (_event, _webContents, details) => {
  appendErrorLog({
    source: 'renderer',
    type: 'render-process-gone',
    message: `reason=${details.reason} exitCode=${details.exitCode}`,
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Solo empaquetado -- backend-manager nunca se inicializó en dev (ahí
    // el backend/Postgres se levantan a mano, ver app.whenReady más abajo),
    // así que llamar shutdownBackend() ahí intentaría parar el
    // opera-postgres-app de backend-manager.ts contra el opera-postgres de
    // docker-compose.yml que la persona desarrolladora levantó por su
    // cuenta -- nombres distintos a propósito (ver backend-manager.ts),
    // pero el riesgo real es el mismo: no tocar el Postgres de dev.
    if (VITE_DEV_SERVER_URL) {
      app.quit();
      win = null;
      return;
    }
    void shutdownBackend().finally(() => {
      app.quit();
      win = null;
    });
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// El tipo del handler (`token: string`) solo lo hace cumplir TypeScript del
// lado del renderer que compilamos nosotros — a runtime, ipcMain.handle
// recibe lo que sea que le llegue por el canal, sin garantía de forma
// (señalado en la re-auditoría). Sin este guard, un token no-string
// reventaría dentro del binding nativo de safeStorage.encryptString con un
// stack críptico en vez de un error claro.
function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} debe ser un string, llegó ${typeof value}`);
  }
  return value;
}

function assertLoggedErrorPayload(value: unknown): Omit<LoggedError, 'source'> {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('El payload de error-log:report debe ser un objeto');
  }
  const entry = value as Record<string, unknown>;
  return {
    type: assertString(entry.type, 'error-log:report.type'),
    message: assertString(entry.message, 'error-log:report.message'),
    stack:
      entry.stack === undefined
        ? undefined
        : assertString(entry.stack, 'error-log:report.stack'),
  };
}

// Único secreto que cruza el puente IPC hoy (#92) — el JWT de sesión,
// cifrado en disco vía `safeStorage` en el proceso principal en vez de
// `localStorage` del renderer.
ipcMain.handle('auth-token:get', () => readToken());
ipcMain.handle('auth-token:set', (_event, token: unknown) =>
  writeToken(assertString(token, 'auth-token:set')),
);
ipcMain.handle('auth-token:clear', () => clearToken());

// Errores del renderer (window.onerror/unhandledrejection) llegan aquí para
// terminar en el mismo archivo que los del proceso principal — un solo
// registro que exportar, no dos.
ipcMain.handle('error-log:report', (_event, entry: unknown) =>
  appendErrorLog({ ...assertLoggedErrorPayload(entry), source: 'renderer' }),
);
ipcMain.handle('error-log:export', () => exportErrorLog());
ipcMain.handle('updater:restart', () => restartAndInstall());

void app.whenReady().then(() => {
  if (!VITE_DEV_SERVER_URL) {
    applyContentSecurityPolicy();
  }
  createWindow();
  // Solo en empaquetado — en dev (`pnpm dev`, cargando desde Vite) no hay
  // ningún instalador real que actualizar, y electron-updater espera un
  // `app-update.yml` que solo `electron-builder` genera al empaquetar.
  if (!VITE_DEV_SERVER_URL && win) {
    initAutoUpdater(win);
    initBackendManager(win);
  }
});
