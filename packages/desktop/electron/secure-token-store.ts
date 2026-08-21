import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Único artefacto que persiste el JWT en disco entre sesiones — cifrado con
// las claves del SO (DPAPI en Windows, Keychain en macOS) vía Electron
// safeStorage, nunca en texto plano (#92). Si el SO no puede cifrar
// (safeStorage.isEncryptionAvailable() === false — típico solo en Linux sin
// keyring desbloqueado), preferimos no persistir nada a persistir el token
// en claro: la sesión no sobrevive un reinicio de la app, pero nunca queda
// un secreto legible con acceso directo al disco.
function tokenFilePath(): string {
  return path.join(app.getPath('userData'), 'auth.token');
}

export function readToken(): string | null {
  if (!safeStorage.isEncryptionAvailable() || !existsSync(tokenFilePath())) {
    return null;
  }
  try {
    return safeStorage.decryptString(readFileSync(tokenFilePath()));
  } catch {
    // Archivo corrupto o cifrado con una clave de otra máquina/usuario —
    // tratarlo como "no hay sesión" en vez de tumbar el arranque de la app.
    return null;
  }
}

export function writeToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    return;
  }
  writeFileSync(tokenFilePath(), safeStorage.encryptString(token));
}

export function clearToken(): void {
  if (existsSync(tokenFilePath())) {
    unlinkSync(tokenFilePath());
  }
}
