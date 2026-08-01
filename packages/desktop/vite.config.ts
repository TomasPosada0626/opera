import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

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
})
