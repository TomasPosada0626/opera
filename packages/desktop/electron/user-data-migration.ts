import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

// La 1.0.0 se empaquetó sin `productName` en package.json, así que Electron
// tomó el `name` del paquete ("desktop") y guardó todo en %APPDATA%\desktop
// en vez de %APPDATA%\Opera, como dicen el README y la guía de instalación
// (encontrado en las dos primeras PCs reales). Ahora que se llama Opera, lo
// que la 1.0.0 ya guardó se copia a la carpeta nueva una sola vez: sin esto,
// actualizar perdería de vista los respaldos automáticos y pediría iniciar
// sesión de nuevo.
const LEGACY_DIR_NAME = 'desktop';

// Solo lo que escribe Opera (backend-manager.ts, secure-token-store.ts,
// error-log-store.ts) -- nunca la carpeta entera: "desktop" es un nombre lo
// bastante genérico como para que otra app Electron sin productName también
// la use. La carpeta vieja queda intacta.
const OPERA_ITEMS = [
  'opera-secrets.json',
  'auth.token',
  'last-backup-at.txt',
  'backups',
  'logs',
];

export function migrateLegacyUserData(): void {
  const current = app.getPath('userData');
  const legacy = path.join(app.getPath('appData'), LEGACY_DIR_NAME);
  if (
    path.resolve(current) === path.resolve(legacy) ||
    !existsSync(path.join(legacy, 'opera-secrets.json'))
  ) {
    return;
  }
  for (const item of OPERA_ITEMS) {
    const from = path.join(legacy, item);
    const to = path.join(current, item);
    if (!existsSync(from) || existsSync(to)) {
      continue;
    }
    try {
      mkdirSync(current, { recursive: true });
      cpSync(from, to, { recursive: true });
    } catch {
      // Best-effort, ítem por ítem: si uno falla (antivirus, archivo en
      // uso), el resto igual se copia y la carpeta vieja sigue ahí.
    }
  }
}
