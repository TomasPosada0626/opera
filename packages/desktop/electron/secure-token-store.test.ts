import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearToken, readToken, writeToken } from './secure-token-store';

// Fuera de un proceso Electron real, `electron` no expone `app`/`safeStorage`
// — se mockea con un cifrado reversible marcado, para poder simular también
// el caso real de `decryptString` lanzando (dato corrupto o cifrado con la
// clave de otra máquina/usuario).
let encryptionAvailable = true;
let userDataDir = '';
const MARKER = 'enc:';

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (plain: string) => Buffer.from(MARKER + plain, 'utf8'),
    decryptString: (buf: Buffer) => {
      const raw = buf.toString('utf8');
      if (!raw.startsWith(MARKER)) {
        throw new Error('bad ciphertext');
      }
      return raw.slice(MARKER.length);
    },
  },
}));

describe('secure-token-store', () => {
  beforeEach(() => {
    encryptionAvailable = true;
    userDataDir = mkdtempSync(path.join(os.tmpdir(), 'opera-token-'));
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it('returns null when no token has been written', () => {
    expect(readToken()).toBeNull();
  });

  it('round-trips a token through write/read', () => {
    writeToken('jwt-abc');
    expect(readToken()).toBe('jwt-abc');
  });

  it('does not persist the token when encryption is unavailable', () => {
    encryptionAvailable = false;
    writeToken('jwt-abc');
    expect(readToken()).toBeNull();
  });

  it('returns null instead of throwing when the token file is corrupt', () => {
    writeFileSync(
      path.join(userDataDir, 'auth.token'),
      'not-encrypted-garbage',
    );
    expect(readToken()).toBeNull();
  });

  it('clearToken removes the token and is a no-op if none exists', () => {
    writeToken('jwt-abc');
    clearToken();
    expect(readToken()).toBeNull();
    expect(() => clearToken()).not.toThrow();
  });
});
