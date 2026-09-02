import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron/simple';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Con NODE_ENV=test (Vitest ya lo fija solo; playwright.config.ts lo
    // fija a propósito para el webServer de Chromium), el plugin ni se
    // registra -- de lo contrario, arrancar `vite` con este plugin activo
    // LANZA Electron de verdad al levantar el dev server. Eso rompe en dos
    // formas distintas según el entorno: en un runner Linux sin display,
    // Electron no puede inicializar su GUI ("ui/aura/env.cc"); forzando
    // ELECTRON_RUN_AS_NODE para esquivar eso, `electron.app` queda
    // undefined y el propio manejador de errores de electron/main.ts
    // crashea al intentar loguear (encontrado corriendo Playwright en CI
    // real por primera vez). El e2e de Chromium (playwright.config.ts)
    // nunca necesitó el proceso de Electron para empezar — solo la SPA.
    ...(process.env.NODE_ENV === 'test'
      ? []
      : [
          electron({
            main: {
              // Shortcut of `build.lib.entry`.
              entry: 'electron/main.ts',
            },
            preload: {
              // Shortcut of `build.rollupOptions.input`.
              input: path.join(import.meta.dirname, 'electron/preload.ts'),
            },
            // Polyfill the Electron and Node.js API for the Renderer process.
            renderer: {},
          }),
        ]),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // e2e/ son specs de Playwright (#57), no de Vitest — tienen su propio
    // runner (playwright.config.ts) y su propio `test.beforeAll`. resources/
    // y release/ son artefactos de `pnpm build` (backend deployado + el
    // instalador empaquetado) — traen sus propios *.test.js de dependencias
    // vendidas (pino, sonic-boom...) que Vitest recogía por error.
    exclude: ['e2e/**', 'node_modules/**', 'resources/**', 'release/**'],
    // Node 22+ trae su propio `localStorage` global experimental (detrás de
    // --localstorage-file, si no queda `undefined`) que tapa el de jsdom en
    // vez de dejarlo pasar — auth-token.ts necesita el de jsdom para
    // leer/escribir el JWT. Desactivarlo en los workers de test destapa el
    // de jsdom.
    execArgv: ['--no-experimental-webstorage'],
    // Umbral de no-regresión (#62) — un poco por debajo de lo medido al
    // agregarlo (96.18/88/95.59/96.14) para no romper con fluctuaciones
    // menores, no una meta a alcanzar. Mismo espíritu que el
    // `coverageThreshold` del backend, gateado en CI.
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 95,
        branches: 85,
        functions: 93,
        lines: 95,
      },
    },
  },
});
