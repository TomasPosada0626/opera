// Respaldo manual de PostgreSQL (hallazgo P1 de la auditoría 2026-08-28: el
// volumen de docker-compose.yml no tenía ningún mecanismo de backup — para
// un ERP que es el sistema de registro real de inventario/producción/ventas
// de la empresa, perder ese volumen es pérdida total e irrecuperable).
//
// Corre `pg_dump` DENTRO del propio contenedor `opera-postgres` en vez de
// exigir herramientas de PostgreSQL instaladas en el host — el mismo motivo
// por el que docker-compose.yml bindea el puerto a loopback: todo pasa por
// la infraestructura ya definida ahí, sin dependencias nuevas. La conexión
// del pg_dump interno usa el socket local del contenedor (trust), no
// necesita contraseña.
//
// Uso:
//   pnpm --filter backend backup:db
//   pnpm --filter backend backup:db -- --retain-days=7
//
// Restaurar (ver README "Respaldo y restauración"):
//   gunzip -c backups/opera-<fecha>.sql.gz | docker exec -i opera-postgres psql -U opera -d opera
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const CONTAINER_NAME = 'opera-postgres';
const BACKUP_DIR = path.join(__dirname, '..', '..', '..', 'backups');
const DEFAULT_RETAIN_DAYS = 30;

function parseArgs(argv: string[]): { retainDays: number } {
  const retainArg = argv.find((arg) => arg.startsWith('--retain-days='));
  if (!retainArg) {
    return { retainDays: DEFAULT_RETAIN_DAYS };
  }
  const retainDays = Number(retainArg.slice('--retain-days='.length));
  if (!Number.isFinite(retainDays) || retainDays <= 0) {
    throw new Error(`--retain-days inválido: "${retainArg}"`);
  }
  return { retainDays };
}

function pruneOldBackups(retainDays: number): void {
  const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    if (!file.startsWith('opera-') || !file.endsWith('.sql.gz')) {
      continue;
    }
    const fullPath = path.join(BACKUP_DIR, file);
    if (fs.statSync(fullPath).mtimeMs < cutoff) {
      fs.unlinkSync(fullPath);
      console.log(`Borrado respaldo vencido (> ${retainDays} días): ${file}`);
    }
  }
}

function main(): void {
  const { retainDays } = parseArgs(process.argv.slice(2));
  const user = process.env.POSTGRES_USER ?? 'opera';
  const db = process.env.POSTGRES_DB ?? 'opera';

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(BACKUP_DIR, `opera-${timestamp}.sql.gz`);

  console.log(
    `Respaldando base "${db}" (contenedor ${CONTAINER_NAME}) a ${outputFile}...`,
  );

  const dump = execFileSync(
    'docker',
    ['exec', CONTAINER_NAME, 'pg_dump', '-U', user, db],
    { maxBuffer: 1024 * 1024 * 1024 },
  );
  fs.writeFileSync(outputFile, zlib.gzipSync(dump));

  const sizeKb = (fs.statSync(outputFile).size / 1024).toFixed(0);
  console.log(`Respaldo completo: ${outputFile} (${sizeKb} KB).`);

  pruneOldBackups(retainDays);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
