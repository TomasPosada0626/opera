// Descarga (una vez, cacheada) el instalador oficial de Docker Desktop para
// Windows, embebido en el instalador de Opera (ver build/installer.nsh) --
// no se commitea al repo (pesa ~600 MB, ver .gitignore).
//
// El hash SHA256 NUNCA se hardcodea acá: se lee del `checksums.txt` que el
// propio Docker publica junto al instalador, en la misma corrida, y se
// verifica contra el archivo recién descargado antes de aceptarlo. Un hash
// fijo en este archivo quedaría desactualizado en cuanto Docker publique una
// versión nueva bajo la misma URL estable -- y copiarlo a mano una sola vez
// no es más seguro que no verificar nada.
const { createHash } = require('node:crypto');
const {
  createWriteStream,
  existsSync,
  readFileSync,
  statSync,
  unlinkSync,
} = require('node:fs');
const { mkdir, rename } = require('node:fs/promises');
const https = require('node:https');
const path = require('node:path');
const { parseExpectedHash } = require('./parse-checksums.js');
const { withRetry } = require('./retry.js');

const CHECKSUMS_URL = 'https://desktop.docker.com/win/main/amd64/checksums.txt';
const INSTALLER_URL =
  'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe';
const TARGET_DIR = path.join(__dirname, '..', 'resources', 'docker');
const TARGET_FILE = path.join(TARGET_DIR, 'Docker Desktop Installer.exe');

/* v8 ignore start -- I/O real contra node:https, deliberadamente sin test
 * (mismo criterio que parse-checksums.js/retry.js: se extrae y testea la
 * lógica pura, el I/O en sí queda sin mockear). Agregar este archivo a la
 * cobertura por primera vez (fetch-docker-installer.test.mjs, ronda 5) hizo
 * que este bloque, nunca antes contado, arrastrara el umbral agregado del
 * paquete por debajo del mínimo -- ignorado explícitamente en vez de bajar
 * ese umbral global para todo el resto del proyecto (auditoría 2026-09-06,
 * ronda 5, Testing). */
function fetchText(url) {
  return fetchBuffer(url).then((buf) => buf.toString('utf-8'));
}

function fetchBuffer(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode != null &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error(`Demasiadas redirecciones siguiendo ${url}`));
            return;
          }
          resolve(fetchBuffer(res.headers.location, redirectsLeft - 1));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`GET ${url} -> HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}
/* v8 ignore stop */

// Pura, sin I/O -- testeable sin mockear `node:https` (mismo criterio que
// parse-checksums.js/retry.js). Qué hacer con la respuesta de una descarga
// que puede o no haber pedido un Range, sin saber nada de sockets/streams:
// - 3xx con Location: seguir la redirección.
// - Se pidió un Range (alreadyDownloaded > 0) pero el servidor respondió
//   200 (mandó el archivo completo igual, ignorando el Range) o 416 (el
//   offset ya no es válido): no se puede confiar en lo que ya había en
//   disco, hay que reiniciar de cero.
// - 200/206 normales: escribir (de cero) o agregar (al archivo parcial).
// - Cualquier otro código: error.
function decideDownloadAction(statusCode, alreadyDownloaded) {
  if (statusCode != null && statusCode >= 300 && statusCode < 400) {
    return 'redirect';
  }
  if (alreadyDownloaded > 0 && (statusCode === 200 || statusCode === 416)) {
    return 'restart';
  }
  if (statusCode !== 200 && statusCode !== 206) {
    return 'error';
  }
  return statusCode === 206 ? 'append' : 'write';
}

/* v8 ignore start -- I/O real, ver el comentario de fetchText/fetchBuffer
 * más arriba (mismo criterio, mismo motivo). */
// Resume (HTTP Range) desde donde cortó un intento anterior -- sin esto,
// cada reintento de withRetry() volvía a bajar los 600+ MB desde cero, el
// peor caso posible para el escenario que ese retry dice cubrir ("corte de
// red a mitad de camino": cuanto más tarde corta, más caro es cada
// reintento). `destPath` sobrevive entre intentos de la MISMA corrida de
// withRetry() (nada lo borra entre uno y otro) -- por eso alcanza con leer
// su tamaño actual en cada llamada, sin que downloadToFile necesite saber
// nada de la lógica de reintento en sí (auditoría 2026-09-06, ronda 5,
// Observabilidad, mejora).
function downloadToFile(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    let alreadyDownloaded = 0;
    try {
      alreadyDownloaded = statSync(destPath).size;
    } catch {
      // No existe todavía -- primer intento, arranca de cero.
    }
    const options =
      alreadyDownloaded > 0
        ? { headers: { Range: `bytes=${alreadyDownloaded}-` } }
        : {};

    // Si el servidor no puede/quiere resumir, no hay que confiar en lo que
    // ya está en disco -- se borra y se reintenta desde cero con la
    // respuesta completa que sí llegó. Converge solo: la próxima llamada ya
    // no encuentra nada en disco, así que no vuelve a pedir un Range.
    function restartFromScratch(res) {
      res.resume();
      try {
        unlinkSync(destPath);
      } catch {
        // Nada que borrar, seguir igual.
      }
      resolve(downloadToFile(url, destPath, redirectsLeft));
    }

    https
      .get(url, options, (res) => {
        const action = decideDownloadAction(res.statusCode, alreadyDownloaded);

        if (action === 'redirect') {
          res.resume();
          if (!res.headers.location) {
            reject(
              new Error(`Redirección (${res.statusCode}) sin Location: ${url}`),
            );
            return;
          }
          if (redirectsLeft <= 0) {
            reject(new Error(`Demasiadas redirecciones siguiendo ${url}`));
            return;
          }
          resolve(
            downloadToFile(res.headers.location, destPath, redirectsLeft - 1),
          );
          return;
        }

        if (action === 'restart') {
          restartFromScratch(res);
          return;
        }

        if (action === 'error') {
          res.resume();
          reject(new Error(`GET ${url} -> HTTP ${res.statusCode}`));
          return;
        }

        // 'append' (206, Partial Content -- seguir donde había quedado) o
        // 'write' (200, descarga nueva de punta a punta).
        const fileStream = createWriteStream(destPath, {
          flags: action === 'append' ? 'a' : 'w',
        });
        res.pipe(fileStream);
        fileStream.on('finish', () => fileStream.close(() => resolve()));
        fileStream.on('error', reject);
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

function sha256OfFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function logRetry(what) {
  return (error, attempt, delayMs) => {
    const message = `${what} (intento ${attempt}) falló: ${error instanceof Error ? error.message : error} -- reintentando en ${delayMs / 1000}s...`;
    console.log(message);
    // Comando de workflow de GitHub Actions -- sin esto, un reintento
    // aislado queda enterrado en el log crudo del paso "Package Windows
    // installer" y solo se nota si alguien lo abre entero. Con esto, GitHub
    // Actions lo resalta en el resumen de la corrida (icono de warning en
    // el step). Fuera de CI (dev local, `GITHUB_ACTIONS` sin setear) es
    // inocuo -- cualquier otro entorno lo imprime como texto plano, GitHub
    // Actions setea esa variable de entorno siempre (auditoría 2026-09-06,
    // ronda 5, Observabilidad, mejora).
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::warning::${message}`);
    }
  };
}

async function main() {
  console.log('Consultando el checksum oficial de Docker Desktop...');
  const checksumsText = await withRetry(() => fetchText(CHECKSUMS_URL), {
    onRetry: logRetry('Descarga de checksums.txt'),
  });
  const expectedHash = parseExpectedHash(checksumsText);

  if (existsSync(TARGET_FILE)) {
    const currentHash = sha256OfFile(TARGET_FILE);
    if (currentHash === expectedHash) {
      console.log(
        `Docker Desktop Installer.exe ya está en caché y coincide con el checksum publicado (${expectedHash}) -- no se vuelve a descargar.`,
      );
      return;
    }
    console.log(
      'El archivo en caché no coincide con la versión actual publicada por Docker -- se vuelve a descargar.',
    );
  }

  await mkdir(TARGET_DIR, { recursive: true });
  const tempFile = `${TARGET_FILE}.download`;
  console.log(
    'Descargando Docker Desktop Installer.exe (puede tardar varios minutos)...',
  );
  await withRetry(() => downloadToFile(INSTALLER_URL, tempFile), {
    onRetry: logRetry('Descarga de Docker Desktop Installer.exe'),
  });

  const actualHash = sha256OfFile(tempFile);
  if (actualHash !== expectedHash) {
    unlinkSync(tempFile);
    throw new Error(
      `Checksum inválido: se esperaba ${expectedHash}, se descargó ${actualHash}. ` +
        'Se borró el archivo descargado -- no se embebe un instalador sin verificar.',
    );
  }

  await rename(tempFile, TARGET_FILE);
  console.log(
    `Docker Desktop Installer.exe verificado y listo (${expectedHash}).`,
  );
}

// `require.main === module` -- no correr `main()` (red real) cuando este
// archivo se importa desde un test para ejercitar `decideDownloadAction()`,
// mismo patrón que `backup-db.ts` (packages/backend/scripts/).
if (require.main === module) {
  main().catch((error) => {
    const attempts = error instanceof Error ? error.attempts : undefined;
    console.error(
      attempts
        ? `No se pudo preparar el instalador de Docker Desktop embebido (tras ${attempts} intentos):`
        : 'No se pudo preparar el instalador de Docker Desktop embebido:',
    );
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
/* v8 ignore stop */

module.exports = { decideDownloadAction };
