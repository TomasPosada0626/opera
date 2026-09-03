// Extraído de fetch-docker-installer.js a propósito: es la única lógica real
// de parseo de ese script (el resto es descarga/verificación de red), y
// separarla en un módulo sin I/O permite testearla sin mockear `node:https`
// -- y sin que la cobertura global cuente como "sin cubrir" el resto del
// script (descarga real, deliberadamente sin tests, ver ROADMAP de la
// auditoría 2026-09-01 ronda 2).
const FILE_NAME = 'Docker Desktop Installer.exe';

function parseExpectedHash(checksumsText) {
  const line = checksumsText
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.toLowerCase().endsWith(FILE_NAME.toLowerCase()));
  if (!line) {
    throw new Error(
      `checksums.txt no tiene ninguna línea para "${FILE_NAME}" -- Docker pudo haber cambiado el formato del archivo.`,
    );
  }
  const match = /^([0-9a-f]{64})\s+\*?.+$/i.exec(line);
  if (!match) {
    throw new Error(`No se pudo interpretar la línea de checksums: "${line}"`);
  }
  return match[1].toLowerCase();
}

module.exports = { FILE_NAME, parseExpectedHash };
