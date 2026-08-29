import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// pino-roll escribe logs/opera-backend.log relativo al cwd del proceso
// (packages/backend/ vía `pnpm --filter backend start:dev`/`start:prod`) —
// mismo supuesto que ya usa app.module.ts al configurar el transport, no
// uno nuevo introducido acá.
const LOG_FILE = join(process.cwd(), 'logs', 'opera-backend.log');

// pino: 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal.
const WARN_LEVEL = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

// Sin Alertmanager para LAN-only (señalado en la auditoría 2026-08-28) —
// esto es lo mínimo para que "algo anda mal" se note desde el propio
// Dashboard en vez de exigir abrir el archivo de log a mano. Best-effort a
// propósito, mismo criterio que MailService: si el archivo no existe, está
// corrupto, o el proceso arrancó hace menos de 24h, cuenta lo que hay y
// nunca revienta la carga del dashboard por esto. Solo lee el archivo
// actual (no los rotados) — pino-roll lo limita a 10MB antes de rotar, así
// que leerlo entero es barato, y si el proceso lleva corriendo menos de
// 24h el conteo real es simplemente ese período más corto, no un error.
export function countRecentWarnings(now: Date = new Date()): number {
  if (!existsSync(LOG_FILE)) {
    return 0;
  }

  const cutoff = now.getTime() - DAY_MS;
  let lines: string[];
  try {
    lines = readFileSync(LOG_FILE, 'utf8').split('\n');
  } catch {
    return 0;
  }

  let count = 0;
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    try {
      const entry = JSON.parse(line) as { level?: unknown; time?: unknown };
      if (
        typeof entry.level === 'number' &&
        entry.level >= WARN_LEVEL &&
        typeof entry.time === 'number' &&
        entry.time >= cutoff
      ) {
        count++;
      }
    } catch {
      // Línea no-JSON (p. ej. un corte de rotación a mitad de escritura) —
      // se ignora, no debe tumbar el conteo completo.
    }
  }
  return count;
}
