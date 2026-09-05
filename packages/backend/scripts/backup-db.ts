// Respaldo manual de PostgreSQL (hallazgo P1 de la auditoría 2026-08-28: el
// volumen de docker-compose.yml no tenía ningún mecanismo de backup — para
// un ERP que es el sistema de registro real de inventario/producción/ventas
// de la empresa, perder ese volumen es pérdida total e irrecuperable).
//
// Corre `pg_dump` DENTRO del propio contenedor de Postgres en vez de exigir
// herramientas de PostgreSQL instaladas en el host — el mismo motivo por el
// que docker-compose.yml bindea el puerto a loopback: todo pasa por la
// infraestructura ya definida ahí, sin dependencias nuevas. La conexión del
// pg_dump interno usa el socket local del contenedor (trust), no necesita
// contraseña.
//
// Nombre de contenedor configurable por env var (no hardcodeado) -- el
// instalador autocontenido usa un Postgres propio, namespaceado aparte del
// de dev (`opera-postgres-app`, no `opera-postgres`, ver
// electron/backend-manager.ts) justo para que nunca colisionen entre sí.
// Este script no sabe cuál de los dos es sin que se lo digan (auditoría
// 2026-09-03, ronda 3 -- el rename de esa sesión rompió este script en
// silencio hasta que se detectó acá).
//
// Uso:
//   pnpm --filter backend backup:db
//   pnpm --filter backend backup:db -- --retain-days=7
//   POSTGRES_CONTAINER=opera-postgres-app pnpm --filter backend backup:db
//
// OPERA_BACKUP_DIR (opcional): dónde guardar los .sql.gz -- sin setear, cae
// en `<repo>/backups`, pensado para correr desde el repo en dev. El
// instalador empaquetado (ver runBackupIfDue() en
// electron/backend-manager.ts, que invoca este mismo script compilado) lo
// pisa con una carpeta en ProgramData -- el default relativo a este archivo
// caería dentro de `resources/`, que electron-builder reemplaza entero en
// cada actualización.
//
// Restaurar (ver README "Respaldo y restauración"):
//   gunzip -c backups/opera-<fecha>.sql.gz | docker exec -i opera-postgres psql -U opera -d opera
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const DEFAULT_CONTAINER_NAME = 'opera-postgres';
const DEFAULT_BACKUP_DIR = path.join(__dirname, '..', '..', '..', 'backups');
const DEFAULT_RETAIN_DAYS = 30;

export function parseArgs(argv: string[]): { retainDays: number } {
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

export function resolveContainerName(): string {
  return process.env.POSTGRES_CONTAINER ?? DEFAULT_CONTAINER_NAME;
}

export function resolveBackupDir(): string {
  return process.env.OPERA_BACKUP_DIR ?? DEFAULT_BACKUP_DIR;
}

export function pruneOldBackups(retainDays: number): void {
  const backupDir = resolveBackupDir();
  const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(backupDir)) {
    if (!file.startsWith('opera-') || !file.endsWith('.sql.gz')) {
      continue;
    }
    const fullPath = path.join(backupDir, file);
    if (fs.statSync(fullPath).mtimeMs < cutoff) {
      fs.unlinkSync(fullPath);
      console.log(`Borrado respaldo vencido (> ${retainDays} días): ${file}`);
    }
  }
}

export function main(): void {
  const { retainDays } = parseArgs(process.argv.slice(2));
  const user = process.env.POSTGRES_USER ?? 'opera';
  const db = process.env.POSTGRES_DB ?? 'opera';
  const container = resolveContainerName();
  const backupDir = resolveBackupDir();

  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(backupDir, `opera-${timestamp}.sql.gz`);

  console.log(
    `Respaldando base "${db}" (contenedor ${container}) a ${outputFile}...`,
  );

  const dump = execFileSync(
    'docker',
    ['exec', container, 'pg_dump', '-U', user, db],
    { maxBuffer: 1024 * 1024 * 1024 },
  );
  fs.writeFileSync(outputFile, zlib.gzipSync(dump));

  const sizeKb = (fs.statSync(outputFile).size / 1024).toFixed(0);
  console.log(`Respaldo completo: ${outputFile} (${sizeKb} KB).`);

  pruneOldBackups(retainDays);
}

// `require.main === module` -- no correr `main()` (docker/fs reales) cuando
// este archivo se importa desde un test para ejercitar `parseArgs()`/
// `pruneOldBackups()`/`resolveContainerName()`.
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
