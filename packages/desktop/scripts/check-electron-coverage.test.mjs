import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const { findViolations, findElectronFiles, FLOOR } = createRequire(
  import.meta.url,
)('./check-electron-coverage.js');

const ELECTRON_DIR = 'C:\\repo\\packages\\desktop\\electron\\';

function fakeMetrics(pct) {
  return {
    statements: { pct },
    branches: { pct },
    functions: { pct },
    lines: { pct },
  };
}

describe('findElectronFiles', () => {
  it('solo incluye archivos bajo electron/, sin los .test.', () => {
    const summary = {
      [`${ELECTRON_DIR}backend-manager.ts`]: fakeMetrics(80),
      [`${ELECTRON_DIR}backend-manager.test.ts`]: fakeMetrics(100),
      'C:\\repo\\packages\\desktop\\src\\pages\\LoginPage.tsx': fakeMetrics(50),
    };

    const files = findElectronFiles(summary, ELECTRON_DIR);

    expect(files).toHaveLength(1);
    expect(files[0][0]).toBe(`${ELECTRON_DIR}backend-manager.ts`);
  });
});

describe('findViolations', () => {
  it('no reporta nada si todos los archivos cumplen el piso', () => {
    const summary = {
      [`${ELECTRON_DIR}main.ts`]: fakeMetrics(95),
    };

    expect(findViolations(summary, ELECTRON_DIR, FLOOR)).toEqual([]);
  });

  it('reporta cada métrica por debajo del piso, por archivo', () => {
    const summary = {
      [`${ELECTRON_DIR}backend-manager.ts`]: {
        statements: { pct: 93.42 },
        branches: { pct: 50 }, // por debajo del piso de 68
        functions: { pct: 92.3 },
        lines: { pct: 94.47 },
      },
    };

    const violations = findViolations(summary, ELECTRON_DIR, FLOOR);

    expect(violations).toEqual([
      {
        file: `${ELECTRON_DIR}backend-manager.ts`,
        metric: 'branches',
        pct: 50,
        floor: FLOOR.branches,
      },
    ]);
  });

  it('ignora archivos fuera de electron/ aunque tengan cobertura pésima', () => {
    const summary = {
      'C:\\repo\\packages\\desktop\\src\\lib\\query-client.ts': fakeMetrics(10),
    };

    expect(findViolations(summary, ELECTRON_DIR, FLOOR)).toEqual([]);
  });

  it('reporta múltiples archivos y múltiples métricas a la vez', () => {
    const summary = {
      [`${ELECTRON_DIR}a.ts`]: fakeMetrics(10),
      [`${ELECTRON_DIR}b.ts`]: fakeMetrics(95),
    };

    const violations = findViolations(summary, ELECTRON_DIR, FLOOR);

    expect(violations).toHaveLength(4); // las 4 métricas de a.ts, ninguna de b.ts
    expect(violations.every((v) => v.file === `${ELECTRON_DIR}a.ts`)).toBe(
      true,
    );
  });
});
