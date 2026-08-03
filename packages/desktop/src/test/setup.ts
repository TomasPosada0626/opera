import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Sin `test.globals` en vitest.config, RTL no encuentra un `afterEach`
// ambiental para su auto-cleanup — hay que registrarlo a mano, si no el DOM
// de cada test se acumula sobre el del anterior dentro del mismo archivo.
afterEach(() => {
  cleanup();
});
