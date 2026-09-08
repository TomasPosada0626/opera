// Piso de cobertura POR ARCHIVO para packages/desktop/electron/*.ts --
// separado del umbral agregado de vite.config.mts a propósito: Vitest no
// permite scopear `thresholds.perFile` a un glob específico sin aplicarlo
// también, con los mismos números, a TODO el resto del paquete (confirmado
// en los tipos reales instalados de @vitest/coverage-v8 -- las entradas por
// glob de `thresholds` excluyen `perFile`, es un flag global). Activarlo
// globalmente rompería de inmediato archivos que hoy pasan bien en agregado
// (ej. query-client.ts, ~33% de rama) -- bajar el piso global lo suficiente
// para no romperlos lo volvería simbólico para el resto del proyecto.
//
// Motivado por un hallazgo real (auditoría 2026-09-06, ronda 5, Testing):
// backend-manager.ts (contraseñas machine-wide, backups automáticos,
// escalada a SIGKILL) tenía 72.88% de cobertura de RAMA real, oculto por el
// 87% agregado del paquete completo -- exactamente el tipo de archivo
// crítico que un umbral agregado no protege.
//
// Umbral de NO-REGRESIÓN (mismo criterio que vite.config.mts#coverage.thresholds
// y jest.config del backend) -- un poco por debajo de lo medido al agregar
// esto, no una meta a alcanzar. Requiere que `test:cov` haya corrido antes
// (con el reporter 'json-summary' agregado en vite.config.mts) para generar
// coverage/coverage-summary.json.
const fs = require('node:fs');
const path = require('node:path');

const SUMMARY_PATH = path.join(
  __dirname,
  '..',
  'coverage',
  'coverage-summary.json',
);
const ELECTRON_DIR = path.join(__dirname, '..', 'electron') + path.sep;
const REPO_ROOT = path.join(__dirname, '..');

const FLOOR = {
  statements: 90,
  branches: 68,
  functions: 88,
  lines: 92,
};

// Pura, sin I/O -- testeable sin generar un coverage-summary.json real
// (mismo criterio que parse-checksums.js/retry.js/decideDownloadAction()).
// `summary` es el JSON tal cual lo escribe el reporter 'json-summary' de
// Istanbul/v8: { [rutaAbsoluta]: { statements: {pct}, branches: {pct}, ... } }.
function findElectronFiles(summary, electronDir) {
  return Object.entries(summary).filter(
    ([file]) => file.startsWith(electronDir) && !file.includes('.test.'),
  );
}

function findViolations(summary, electronDir, floor) {
  const violations = [];
  for (const [file, metrics] of findElectronFiles(summary, electronDir)) {
    for (const key of Object.keys(floor)) {
      const pct = metrics[key].pct;
      if (pct < floor[key]) {
        violations.push({ file, metric: key, pct, floor: floor[key] });
      }
    }
  }
  return violations;
}

/* v8 ignore start -- I/O real (fs, process.exit), deliberadamente sin test
 * (mismo criterio que fetch-docker-installer.js/parse-checksums.js/
 * retry.js: se extrae y testea la lógica pura -- findViolations()/
 * findElectronFiles() arriba -- el I/O en sí queda sin mockear). */
function main() {
  if (!fs.existsSync(SUMMARY_PATH)) {
    console.error(
      `No se encontró ${SUMMARY_PATH} -- corré "pnpm test:cov" antes de este script.`,
    );
    process.exit(1);
  }

  const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf-8'));
  const electronFiles = findElectronFiles(summary, ELECTRON_DIR);

  if (electronFiles.length === 0) {
    console.error(
      `No se encontró ningún archivo de "${ELECTRON_DIR}" en el reporte de cobertura -- ¿cambió la estructura de carpetas?`,
    );
    process.exit(1);
  }

  const violations = findViolations(summary, ELECTRON_DIR, FLOOR);
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(
        `${path.relative(REPO_ROOT, v.file)}: ${v.metric} en ${v.pct}%, por debajo del piso de ${v.floor}% para packages/desktop/electron/`,
      );
    }
    console.error(
      '\nCobertura por archivo insuficiente en packages/desktop/electron/ (ver arriba).',
    );
    process.exit(1);
  }

  console.log(
    `Cobertura por archivo de packages/desktop/electron/ OK (${electronFiles.length} archivo(s), piso: statements ${FLOOR.statements}% / branches ${FLOOR.branches}% / functions ${FLOOR.functions}% / lines ${FLOOR.lines}%).`,
  );
}
/* v8 ignore stop */

// `require.main === module` -- mismo patrón que backup-db.ts/
// fetch-docker-installer.js, permite importar findViolations()/
// findElectronFiles() desde un test sin correr main() (que hace process.exit).
if (require.main === module) {
  main();
}

module.exports = { findViolations, findElectronFiles, FLOOR };
