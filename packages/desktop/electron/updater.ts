import { autoUpdater } from 'electron-updater';
import type { BrowserWindow } from 'electron';
import { appendErrorLog } from './error-log-store';

// Cada nueva versión requería generar un instalador y reinstalarlo a mano
// en la máquina de la usuaria final (gap aceptado en ADR 0003, cerrado
// aquí). electron-updater ya sabe hablar con la API de Releases de GitHub
// sin nada adicional — el repo es público, así que ni el chequeo ni la
// descarga necesitan un token embebido en la app (ver electron-builder.json5).
//
// Best-effort a propósito: Opera es una app pensada para operar en LAN sin
// depender de internet para su función real (ver PRODUCT.md) — el chequeo
// de actualizaciones es la única parte que sí necesita salir a internet, y
// si no hay conexión (o GitHub no responde) debe fallar en silencio, nunca
// interrumpir ni mostrarle un error a quien está tratando de trabajar.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas — la app suele quedar abierta toda la jornada.

export function initAutoUpdater(win: BrowserWindow): void {
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('updater:downloaded', { version: info.version });
  });

  autoUpdater.on('error', (error) => {
    // No es un error de la app — casi siempre "no hay internet" o "GitHub
    // no respondió". Queda en el registro local por si alguna vez hay que
    // revisar por qué las actualizaciones no están llegando, pero nunca
    // interrumpe a quien está usando Opera.
    appendErrorLog({
      source: 'main',
      type: 'autoUpdater',
      message: error.message,
      stack: error.stack,
    });
  });

  const checkForUpdates = () => {
    autoUpdater.checkForUpdates().catch(() => {
      // Ya se registró arriba vía el listener 'error' — swallow aquí para
      // que un rechazo de la promesa no aparezca como unhandledRejection.
    });
  };

  checkForUpdates();
  setInterval(checkForUpdates, CHECK_INTERVAL_MS);
}

export function restartAndInstall(): void {
  autoUpdater.quitAndInstall();
}
