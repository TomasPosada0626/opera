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
  unlinkSync,
} = require('node:fs');
const { mkdir, rename } = require('node:fs/promises');
const https = require('node:https');
const path = require('node:path');
const { parseExpectedHash } = require('./parse-checksums.js');

const CHECKSUMS_URL = 'https://desktop.docker.com/win/main/amd64/checksums.txt';
const INSTALLER_URL =
  'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe';
const TARGET_DIR = path.join(__dirname, '..', 'resources', 'docker');
const TARGET_FILE = path.join(TARGET_DIR, 'Docker Desktop Installer.exe');

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

function downloadToFile(url, destPath, redirectsLeft = 5) {
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
          resolve(
            downloadToFile(res.headers.location, destPath, redirectsLeft - 1),
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`GET ${url} -> HTTP ${res.statusCode}`));
          return;
        }
        const fileStream = createWriteStream(destPath);
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

async function main() {
  console.log('Consultando el checksum oficial de Docker Desktop...');
  const checksumsText = await fetchText(CHECKSUMS_URL);
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
  await downloadToFile(INSTALLER_URL, tempFile);

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

main().catch((error) => {
  console.error(
    'No se pudo preparar el instalador de Docker Desktop embebido:',
  );
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
