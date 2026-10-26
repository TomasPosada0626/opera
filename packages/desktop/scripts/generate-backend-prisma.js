// `pnpm deploy` (ver el script `build`) instala el backend en
// `resources/backend`, pero NO corre su `postinstall` (`prisma generate`):
// el cliente de Prisma queda como el stub vacío que trae `@prisma/client`,
// sin modelos ni enums. El backend empaquetado se caía apenas arrancaba
// (`@IsEnum(ProductType)` con `ProductType` undefined) y Opera mostraba
// "Opera se detuvo inesperadamente" en la primera PC real donde se instaló
// la 1.0.0. Se genera acá, con el CLI y el schema que ya quedaron dentro de
// `resources/backend`, y se verifica el resultado: un build que vuelva a
// empaquetar el stub tiene que fallar acá, no en la PC de la usuaria.
const { spawnSync } = require('node:child_process');
const { existsSync, readdirSync } = require('node:fs');
const path = require('node:path');

const backendDir = path.join(__dirname, '..', 'resources', 'backend');
const prismaCli = path.join(
  backendDir,
  'node_modules',
  'prisma',
  'build',
  'index.js',
);

const result = spawnSync(process.execPath, [prismaCli, 'generate'], {
  cwd: backendDir,
  stdio: 'inherit',
});
if (result.status !== 0) {
  console.error('prisma generate falló dentro de resources/backend.');
  process.exit(result.status ?? 1);
}

const clientDir = path.join(backendDir, 'node_modules', '.prisma', 'client');
const hasSchema = existsSync(path.join(clientDir, 'schema.prisma'));
const hasEngine =
  existsSync(clientDir) &&
  readdirSync(clientDir).some((file) => file.startsWith('query_engine-'));
if (!hasSchema || !hasEngine) {
  console.error(
    'El cliente de Prisma de resources/backend quedó incompleto (falta el schema o el motor de consultas).',
  );
  process.exit(1);
}
