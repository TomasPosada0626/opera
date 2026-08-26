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
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // e2e/ son specs de Playwright (#57), no de Vitest — tienen su propio
    // runner (playwright.config.ts) y su propio `test.beforeAll`.
    exclude: ['e2e/**', 'node_modules/**'],
    // Node 22+ trae su propio `localStorage` global experimental (detrás de
    // --localstorage-file, si no queda `undefined`) que tapa el de jsdom en
    // vez de dejarlo pasar — auth-token.ts necesita el de jsdom para
    // leer/escribir el JWT. Desactivarlo en los workers de test destapa el
    // de jsdom.
    execArgv: ['--no-experimental-webstorage'],
  },
});
