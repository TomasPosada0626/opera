import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// jsdom no implementa matchMedia — cualquier pantalla que renderice
// ThemeToggle (useTheme -> getSystemTheme) revienta sin esto. Siempre
// "light" (matches: false) porque ningún test depende de la preferencia de
// tema del sistema, solo de que el componente monte. Object.defineProperty
// (no una asignación directa a window.matchMedia) porque el tipo de DOM lib
// para matchMedia es una firma de método, no una propiedad de función
// corriente.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}

// Sin `test.globals` en vitest.config, RTL no encuentra un `afterEach`
// ambiental para su auto-cleanup — hay que registrarlo a mano, si no el DOM
// de cada test se acumula sobre el del anterior dentro del mismo archivo.
afterEach(() => {
  cleanup();
});

// El default de 1000ms para findBy*/waitFor es ajustado para correr un solo
// archivo; bajo `pnpm -r test` (Jest del backend y Vitest del desktop
// compitiendo por CPU al mismo tiempo, igual que en CI) un findBy* real
// puede tardar más que eso y fallar por timing, no por un bug — visto en
// KardexPage.test.tsx.
configure({ asyncUtilTimeout: 5000 });
