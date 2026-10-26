import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let appDataDir = '';
let userDataDir = '';
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'appData' ? appDataDir : userDataDir),
  },
}));

const { migrateLegacyUserData } = await import('./user-data-migration');

function legacyDir(): string {
  return path.join(appDataDir, 'desktop');
}

function seedLegacy(files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(legacyDir(), name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

describe('migrateLegacyUserData', () => {
  beforeEach(() => {
    appDataDir = mkdtempSync(path.join(os.tmpdir(), 'opera-appdata-'));
    userDataDir = path.join(appDataDir, 'Opera');
  });

  afterEach(() => {
    rmSync(appDataDir, { recursive: true, force: true });
  });

  it('copia a %APPDATA%\\Opera lo que la 1.0.0 guardó en %APPDATA%\\desktop', () => {
    seedLegacy({
      'opera-secrets.json': '{"jwtSecret":"viejo"}',
      'auth.token': 'token-cifrado',
      'last-backup-at.txt': '2026-10-26T15:00:00.000Z',
      'backups/opera-2026-10-26T15-00-00-000Z.sql.gz': 'respaldo',
      'logs/opera-desktop.log': '{"type":"x"}',
    });

    migrateLegacyUserData();

    expect(
      readFileSync(path.join(userDataDir, 'opera-secrets.json'), 'utf-8'),
    ).toBe('{"jwtSecret":"viejo"}');
    expect(
      existsSync(
        path.join(
          userDataDir,
          'backups',
          'opera-2026-10-26T15-00-00-000Z.sql.gz',
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(path.join(userDataDir, 'logs', 'opera-desktop.log')),
    ).toBe(true);
    // La carpeta vieja queda intacta.
    expect(existsSync(path.join(legacyDir(), 'opera-secrets.json'))).toBe(true);
  });

  it('no pisa lo que ya existe en la carpeta nueva', () => {
    seedLegacy({ 'opera-secrets.json': '{"jwtSecret":"viejo"}' });
    mkdirSync(userDataDir, { recursive: true });
    writeFileSync(
      path.join(userDataDir, 'opera-secrets.json'),
      '{"jwtSecret":"nuevo"}',
    );

    migrateLegacyUserData();

    expect(
      readFileSync(path.join(userDataDir, 'opera-secrets.json'), 'utf-8'),
    ).toBe('{"jwtSecret":"nuevo"}');
  });

  it('no toca una carpeta "desktop" que no es de Opera', () => {
    seedLegacy({ 'Local State': '{}', 'auth.token': 'de otra app' });

    migrateLegacyUserData();

    expect(existsSync(userDataDir)).toBe(false);
  });

  it('solo copia los archivos de Opera, no el resto de la carpeta', () => {
    seedLegacy({
      'opera-secrets.json': '{}',
      'Local State': '{}',
    });

    migrateLegacyUserData();

    expect(existsSync(path.join(userDataDir, 'opera-secrets.json'))).toBe(true);
    expect(existsSync(path.join(userDataDir, 'Local State'))).toBe(false);
  });

  it('no hace nada si la carpeta actual ya es la vieja (dev sin productName)', () => {
    seedLegacy({ 'opera-secrets.json': '{}' });
    userDataDir = legacyDir();

    expect(() => migrateLegacyUserData()).not.toThrow();
  });
});
