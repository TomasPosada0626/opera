import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const { buildHarnessScript, hasNsisErrorLines } = createRequire(
  import.meta.url,
)('./check-installer-nsh.js');

describe('buildHarnessScript', () => {
  it('incluye el installer.nsh real vía !include', () => {
    const script = buildHarnessScript(
      'C:\\repo\\packages\\desktop\\build\\installer.nsh',
    );

    expect(script).toContain(
      '!include "C:\\\\repo\\\\packages\\\\desktop\\\\build\\\\installer.nsh"',
    );
  });

  it('inserta customPageAfterChangeDir a nivel de script, no dentro de una Section/Function', () => {
    const script = buildHarnessScript('/repo/installer.nsh');
    const lines = script.split('\n');
    const insertLine = lines.findIndex((l) =>
      l.includes('!insertmacro customPageAfterChangeDir'),
    );
    const sectionLine = lines.findIndex((l) => l.startsWith('Section'));

    expect(insertLine).toBeGreaterThan(-1);
    expect(insertLine).toBeLessThan(sectionLine);
  });

  it('inserta customInit dentro de Function .onInit y customInstall dentro de una Section', () => {
    const script = buildHarnessScript('/repo/installer.nsh');

    expect(script).toMatch(
      /Function \.onInit\s+!insertmacro customInit\s+FunctionEnd/,
    );
    expect(script).toMatch(
      /Section "Install"\s+!insertmacro customInstall\s+SectionEnd/,
    );
  });
});

describe('hasNsisErrorLines', () => {
  it('detecta una línea que empieza con "Error:"', () => {
    expect(hasNsisErrorLines('algo\nError: disco lleno\nmas texto')).toBe(true);
  });

  it('es insensible a mayúsculas/minúsculas', () => {
    expect(hasNsisErrorLines('error: minúscula')).toBe(true);
  });

  it('ignora "Error:" que no está al inicio de la línea (recortada)', () => {
    expect(hasNsisErrorLines('esto no es un Error: real, es texto')).toBe(
      false,
    );
  });

  it('devuelve false para stderr vacío o sin errores', () => {
    expect(hasNsisErrorLines('')).toBe(false);
    expect(hasNsisErrorLines('warning: algo menor\n')).toBe(false);
  });
});
