import { defineConfig, devices } from '@playwright/test';

// Corre contra Chromium propio (no Electron). El renderer es una SPA normal
// servida por Vite (ADR 0003) — probarla en Chromium real ejercita el
// mismo código React/TanStack Query que corre dentro de Electron, solo
// que sin el proceso principal (que la app ya degrada con gracia, ver
// lib/auth-token.ts). La ventana de Electron en sí se verifica a mano.
// NODE_ENV=test en el webServer (ver vite.config.mts) es lo que de verdad
// evita que se lance: sin esto, `vite-plugin-electron` arranca un Electron
// real al levantar el dev server — en un runner Linux sin display eso
// crashea ("ui/aura/env.cc: The platform failed to initialize"), y
// forzando ELECTRON_RUN_AS_NODE para esquivarlo, `electron.app` queda
// undefined y el propio manejador de errores de electron/main.ts crashea
// distinto (encontrado corriendo esto en CI real por primera vez).
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  // Cada spec crea sus propias fixtures (usuario, bodega, producto) contra
  // el MISMO Postgres compartido, sin aislamiento de esquema entre specs —
  // con más de un worker, dos specs corriendo a la vez pueden coexistir con
  // más de una bodega activa al mismo tiempo, lo que rompe el supuesto de
  // WarehouseSelect de "exactamente una bodega = se autoselecciona y oculta
  // el campo" (encontrado corriendo esto por primera vez contra CI real).
  workers: 1,
  // Reintenta en CI (jitter real de red/async entre tests que comparten un
  // solo backend — ver el `workers: 1` de arriba), nunca en local: acá
  // queremos que un fallo real se vea a la primera, no escondido tras un
  // reintento.
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
    env: { NODE_ENV: 'test' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
