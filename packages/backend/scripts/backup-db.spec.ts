// Test de humo (auditoría 2026-09-03, ronda 3): backup-db.ts vivía fuera del
// `rootDir` de Jest (`src`), así que ningún test podía atrapar que el
// nombre de contenedor quedó hardcodeado a `opera-postgres` cuando el
// instalador empaquetado renombró el suyo a `opera-postgres-app`
// (electron/backend-manager.ts) -- ver `roots` en package.json#jest, que
// ahora incluye esta carpeta.
import { execFileSync } from 'child_process';
import * as fs from 'fs';

// `jest.spyOn(fs, ...)` falla con "Cannot redefine property" en varios
// métodos de `fs` (no configurables en esta versión de Node) -- se mockea
// el módulo entero en vez de espiar el real, mismo motivo por el que
// `child_process`/`zlib` también van mockeados acá.
jest.mock('fs');
jest.mock('child_process');
jest.mock('zlib', () => ({ gzipSync: jest.fn((buf: Buffer) => buf) }));

import * as path from 'path';
import {
  main,
  parseArgs,
  pruneOldBackups,
  resolveBackupDir,
  resolveContainerName,
} from './backup-db';

describe('backup-db', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('resolveContainerName', () => {
    it('usa "opera-postgres" por defecto (Postgres de desarrollo)', () => {
      delete process.env.POSTGRES_CONTAINER;
      expect(resolveContainerName()).toBe('opera-postgres');
    });

    it('respeta POSTGRES_CONTAINER (Postgres del instalador empaquetado)', () => {
      process.env.POSTGRES_CONTAINER = 'opera-postgres-app';
      expect(resolveContainerName()).toBe('opera-postgres-app');
    });
  });

  describe('resolveBackupDir', () => {
    it('sin OPERA_BACKUP_DIR, usa <repo>/backups (relativo a este archivo)', () => {
      delete process.env.OPERA_BACKUP_DIR;
      expect(resolveBackupDir()).toBe(
        path.join(__dirname, '..', '..', '..', 'backups'),
      );
    });

    it('respeta OPERA_BACKUP_DIR (instalador empaquetado, ver backend-manager.ts)', () => {
      process.env.OPERA_BACKUP_DIR = 'C:\\ProgramData\\Opera\\backups';
      expect(resolveBackupDir()).toBe('C:\\ProgramData\\Opera\\backups');
    });
  });

  describe('parseArgs', () => {
    it('usa 30 días de retención por defecto', () => {
      expect(parseArgs([])).toEqual({ retainDays: 30 });
    });

    it('acepta --retain-days=N', () => {
      expect(parseArgs(['--retain-days=7'])).toEqual({ retainDays: 7 });
    });

    it('lanza con un valor no numérico', () => {
      expect(() => parseArgs(['--retain-days=abc'])).toThrow(
        /--retain-days inválido/,
      );
    });

    it('lanza con un valor negativo o cero', () => {
      expect(() => parseArgs(['--retain-days=0'])).toThrow(
        /--retain-days inválido/,
      );
    });
  });

  describe('pruneOldBackups', () => {
    it('borra solo los .sql.gz vencidos, respeta el resto', () => {
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      jest
        .mocked(fs.readdirSync)
        .mockReturnValue([
          'opera-vencido.sql.gz',
          'opera-reciente.sql.gz',
          'otro-archivo.txt',
        ] as never);
      jest.mocked(fs.statSync).mockImplementation(
        (filePath) =>
          ({
            mtimeMs: String(filePath).includes('vencido')
              ? now - 40 * oneDayMs
              : now - 1 * oneDayMs,
          }) as fs.Stats,
      );

      pruneOldBackups(30);

      expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('opera-vencido.sql.gz'),
      );
    });
  });

  describe('main', () => {
    it('usa el contenedor de POSTGRES_CONTAINER, no el default hardcodeado', () => {
      process.env.POSTGRES_CONTAINER = 'opera-postgres-app';
      jest.mocked(fs.statSync).mockReturnValue({ size: 0 } as fs.Stats);
      jest.mocked(fs.readdirSync).mockReturnValue([] as never);
      jest.mocked(execFileSync).mockReturnValue(Buffer.from(''));

      main();

      expect(execFileSync).toHaveBeenCalledWith(
        'docker',
        ['exec', 'opera-postgres-app', 'pg_dump', '-U', 'opera', 'opera'],
        expect.anything(),
      );
    });
  });
});
