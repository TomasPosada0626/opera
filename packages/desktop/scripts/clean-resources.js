// `pnpm deploy` (ver el script `build`) rechaza escribir sobre un directorio
// que ya existe y no está vacío (ERR_PNPM_DEPLOY_DIR_NOT_EMPTY) -- sin este
// paso, la segunda vez que alguien corre `pnpm build` en la misma máquina
// (con `resources/backend` ya generado por la corrida anterior) el build
// entero falla. `node` en vez de `rm -rf`/`rimraf` porque ya corre en todas
// las plataformas donde corre este script, sin agregar una dependencia
// nueva solo para esto.
//
// Solo `resources/backend`, NO todo `resources/` -- `resources/docker/`
// (ver fetch-docker-installer.js) es una caché de ~600 MB que debe
// sobrevivir entre builds, no algo para borrar en cada corrida.
const { rmSync } = require('node:fs');
const path = require('node:path');

rmSync(path.join(__dirname, '..', 'resources', 'backend'), {
  recursive: true,
  force: true,
});
