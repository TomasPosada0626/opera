import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { clearToken, readToken, writeToken } from './secure-token-store';

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
    // En empaquetado, win.icon (electron-builder.json5) ya deja el ícono
    // grabado en el .exe — esto además cubre `pnpm dev` (sin empaquetar,
    // corriendo directo contra Electron), donde si no se pasa nada aquí
    // se ve el ícono genérico de Electron en la barra de tareas.
    icon: path.join(process.env.VITE_PUBLIC, 'icon-256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Único secreto que cruza el puente IPC hoy (#92) — el JWT de sesión,
// cifrado en disco vía `safeStorage` en el proceso principal en vez de
// `localStorage` del renderer.
ipcMain.handle('auth-token:get', () => readToken());
ipcMain.handle('auth-token:set', (_event, token: string) => writeToken(token));
ipcMain.handle('auth-token:clear', () => clearToken());

void app.whenReady().then(() => {
  if (!VITE_DEV_SERVER_URL) {
    applyContentSecurityPolicy();
  }
  createWindow();
});
