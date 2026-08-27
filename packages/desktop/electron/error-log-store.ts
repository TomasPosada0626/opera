import { app, dialog } from 'electron';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';

// Contraparte del lado desktop de la observabilidad agregada al backend
// (nestjs-pino) — la app es LAN-only, sin ninguna dependencia de internet
// nueva (un Sentry rompería eso), así que el registro es local: si algo
// falla en la máquina de la usuaria final, hoy no queda ningún rastro que
// revisar después salvo lo que ella recuerde reportar. Con esto, al menos
// hay un archivo real que exportar y mandar.
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

function logFilePath(): string {
  return path.join(app.getPath('userData'), 'logs', 'opera-desktop.log');
}

// Rotación mínima por tamaño (no vale la pena traer pino/pino-roll al lado
// de Electron por un solo archivo de errores, muchísimo más liviano que el
// log de requests del backend) — un solo respaldo, no una serie completa.
function rotateIfNeeded(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }
  if (statSync(filePath).size < MAX_SIZE_BYTES) {
    return;
  }
  const rotatedPath = `${filePath}.1`;
  if (existsSync(rotatedPath)) {
    unlinkSync(rotatedPath);
  }
  renameSync(filePath, rotatedPath);
}

export interface LoggedError {
  source: 'main' | 'renderer';
  type: string;
  message: string;
  stack?: string;
}

export function appendErrorLog(entry: LoggedError): void {
  const filePath = logFilePath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  rotateIfNeeded(filePath);
  const line = JSON.stringify({ time: new Date().toISOString(), ...entry });
  appendFileSync(filePath, line + '\n', 'utf8');
}

// "Exportar" en vez de "ver": la usuaria no necesita leer JSON crudo, solo
// mandar el archivo por WhatsApp/correo cuando algo falla — un diálogo de
// guardar-como con nombre amigable es lo más simple que logra eso.
export async function exportErrorLog(): Promise<
  { ok: true; path: string } | { ok: false; reason: string }
> {
  const filePath = logFilePath();
  if (!existsSync(filePath)) {
    return { ok: false, reason: 'no-logs' };
  }

  const { canceled, filePath: destination } = await dialog.showSaveDialog({
    title: 'Exportar registro de errores',
    defaultPath: `opera-errores-${new Date().toISOString().slice(0, 10)}.log`,
  });
  if (canceled || !destination) {
    return { ok: false, reason: 'canceled' };
  }

  copyFileSync(filePath, destination);
  return { ok: true, path: destination };
}
