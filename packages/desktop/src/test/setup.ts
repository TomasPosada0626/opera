import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

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
