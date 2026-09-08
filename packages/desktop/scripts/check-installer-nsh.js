// Smoke test de sintaxis para build/installer.nsh (auditoria 2026-09-06,
// ronda 5, Testing/Observabilidad): CI compila este archivo como parte de
// `pnpm --filter desktop build` (job package-windows, ~6-10 min en
// windows-latest, con la descarga del instalador de Docker Desktop de por
// medio) -- una forma rapida y liviana de detectar un error de sintaxis
// ANTES de esperar a ese job completo, corriendo en el mismo job rapido
// (lint-test-build, ubuntu-latest) que ya corre en cada push.
//
// No se intenta reproducir el script NSIS completo que arma electron-builder
// (investigado a fondo: incluye archivos temporales efimeros con nombre
// aleatorio por corrida -- mensajes localizados via addCustomMessageFileInclude
// -- y una carpeta de plugins resuelta en runtime, ninguno de los dos
// reproducible como fixture estatico sin quedar desactualizado de inmediato).
// En cambio, este script arma un arnes minimo (ver buildHarnessScript) que
// `!include`ea el archivo REAL y VIVO de installer.nsh y ejercita cada una
// de sus macros (customInit/customPageAfterChangeDir/customInstall, que a su
// vez inserta ProvisionPostgresSecret/InstallDockerDesktop/
// ScheduleResumeAndReboot/CleanupResumeTask) -- exactamente lo que nosotros
// mantenemos y podemos romper. Validado a mano (2026-09-08) que SI detecta
// un typo de comando real y un bloque ${If}/${EndIf} desbalanceado.
//
// Limite conocido y aceptado (mismo que ya documentaba el hallazgo): esto
// valida SINTAXIS, no logica en runtime -- una condicion invertida en un
// ${If} que sigue balanceado compila igual de limpio. Eso solo lo puede
// atrapar una corrida real del instalador (ver "hueco de evidencia" del
// roadmap de auditoria).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const INSTALLER_NSH_PATH = path.join(__dirname, '..', 'build', 'installer.nsh');

// Arnes minimo: NO reproduce el wizard completo de electron-builder (Section
// install/instfiles reales, paginas MUI, etc.) -- solo lo suficiente para
// que NSIS expanda (`!insertmacro`) cada macro que definimos, en el mismo
// contexto (Function vs Section) que electron-builder usa de verdad. Sin
// esto, un `!macro ... !macroend` nunca definido/insertado no se parsea en
// absoluto (las macros de NSIS son sustitucion textual en el punto de
// inserccion, no se validan al definirse).
function buildHarnessScript(installerNshPath) {
  return `Name "Opera installer.nsh smoke test"
OutFile "${path.join(os.tmpdir(), 'opera-installer-nsh-smoke-test.exe').replace(/\\/g, '\\\\')}"
RequestExecutionLevel admin

!include "${installerNshPath.replace(/\\/g, '\\\\')}"

!insertmacro customPageAfterChangeDir
Page instfiles

Function .onInit
  !insertmacro customInit
FunctionEnd

Section "Install"
  !insertmacro customInstall
SectionEnd
`;
}

// makensis puede terminar con código 0 y aun así haber escrito un "Error:"
// a stderr (mismo caso límite que valida electron-builder's propio
// checkMakensisOutput en nsisValidation.js -- no reinventado, replicado a
// propósito para no depender de una API interna no exportada).
function hasNsisErrorLines(stderr) {
  return stderr
    .split('\n')
    .map((line) => line.trim())
    .some((line) => /^Error:/i.test(line));
}

/* v8 ignore start -- I/O real (fs, spawnSync, red la primera vez que
 * descarga makensis) -- mismo criterio que el resto de scripts/: la lógica
 * pura de arriba (buildHarnessScript/hasNsisErrorLines) se testea sola. */
async function main() {
  if (!fs.existsSync(INSTALLER_NSH_PATH)) {
    console.error(`No se encontró ${INSTALLER_NSH_PATH}.`);
    process.exit(1);
  }

  // Resuelto vía la propia electron-builder (ya devDependency de este
  // paquete) en vez de asumir una ruta de node_modules/.pnpm fija -- ese
  // hash de pnpm cambia con cualquier bump de versión. `require.resolve`
  // con `paths` busca app-builder-lib dentro del árbol de dependencias
  // REAL de electron-builder, sin necesitar declararlo nosotros mismos.
  // Descarga el binario de NSIS (makensis, ~pocos MB, no los ~600 MB del
  // instalador de Docker Desktop) la primera vez que corre en una máquina;
  // queda cacheado después, igual que lo hace un build real.
  const electronBuilderEntry = require.resolve('electron-builder');
  const { getMakeNsisPath } = require(
    require.resolve('app-builder-lib/out/toolsets/windows.js', {
      paths: [electronBuilderEntry],
    }),
  );
  const makensis = await getMakeNsisPath(undefined, undefined);

  const harnessPath = path.join(
    os.tmpdir(),
    'opera-installer-nsh-smoke-test.nsi',
  );
  fs.writeFileSync(harnessPath, buildHarnessScript(INSTALLER_NSH_PATH));

  const result = spawnSync(makensis.path, [harnessPath], {
    env: { ...process.env, ...makensis.env },
    encoding: 'utf-8',
  });

  fs.rmSync(harnessPath, { force: true });
  fs.rmSync(path.join(os.tmpdir(), 'opera-installer-nsh-smoke-test.exe'), {
    force: true,
  });

  const stderr = result.stderr ?? '';
  if (result.status !== 0 || hasNsisErrorLines(stderr)) {
    console.error('makensis encontró un error compilando installer.nsh:\n');
    console.error(result.stdout ?? '');
    console.error(stderr);
    process.exit(1);
  }

  console.log('installer.nsh compila sin errores (smoke test de sintaxis).');
}

// `require.main === module` -- mismo patrón que check-electron-coverage.js/
// backup-db.ts, permite importar buildHarnessScript()/hasNsisErrorLines()
// desde un test sin correr main() (que hace process.exit).
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
/* v8 ignore stop */

module.exports = { buildHarnessScript, hasNsisErrorLines };
