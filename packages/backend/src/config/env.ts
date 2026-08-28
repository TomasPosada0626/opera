import { existsSync } from 'fs';
import { config } from 'dotenv';
import { dirname, join } from 'path';

// Sube desde __dirname (no process.cwd(), señalado en la re-auditoría como
// frágil: dependía de que el proceso siempre arrancara con cwd ==
// packages/backend, algo que ni ts-node en dev ni un `node dist/src/main`
// invocado desde otro directorio garantizan) hasta encontrar la raíz del
// monorepo — identificada por pnpm-workspace.yaml, que solo existe ahí.
function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      // No se encontró — deja que dotenv falle en silencio como antes en
      // vez de reventar el arranque por esto.
      return startDir;
    }
    dir = parent;
  }
  return dir;
}

// Un solo .env en la raíz del monorepo, compartido con docker-compose (ver .env.example).
// Se carga aquí, antes de cualquier otro import, porque PrismaClient lee DATABASE_URL
// al conectarse y el orden de inicialización de módulos de Nest no lo garantiza.
config({
  path: join(findMonorepoRoot(__dirname), '.env'),
  quiet: true,
});
