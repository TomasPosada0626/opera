// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-electron/**',
      '**/release/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      'pnpm-lock.yaml',
      'eslint.config.mjs',
      // Scripts de k6 — corren en el runtime propio de k6 (goja), no en
      // Node, y no forman parte de ningún tsconfig del monorepo.
      'packages/backend/load-tests/k6/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  // Backend (NestJS) — Node + Jest, decorator-heavy DI code
  {
    files: ['packages/backend/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: `${import.meta.dirname}/packages/backend`,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
    },
  },
  // Desktop (Electron + React)
  {
    files: ['packages/desktop/**/*.{ts,tsx,mts}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: `${import.meta.dirname}/packages/desktop`,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Un componente nuevo puede romper el patrón de accesibilidad
      // manual del resto de la app (focus trap, labels asociados,
      // aria-describedby — ver Modal.tsx/TextField.tsx) sin que nada lo
      // note, salvo revisión humana (señalado en la auditoría 2026-08-28).
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  // electron/*.test.ts mockea 'electron' entero y hace vi.mocked(app.on),
  // vi.mocked(win.webContents.on), etc. — unbound-method asume que un
  // método leído así podría perder su `this` real al llamarse suelto, pero
  // acá el objeto completo ES el mock (vi.fn()s que nunca usan `this`), así
  // que la advertencia no aplica. Sin eslint-plugin-jest (que trae una
  // versión de esta regla consciente de mocks), se apaga solo en estos
  // archivos en vez de en todo el paquete. Los tres de abajo son fricción
  // esperada del mismo motivo: los tipos reales de Electron (overloads de
  // BrowserWindow/app/ipcMain) no coinciden 1:1 con la forma simple del
  // mock, y justamente lo que este archivo prueba es la validación runtime
  // de payloads sin forma garantizada cruzando IPC — el `any`/`unknown`
  // ahí es intencional, no un descuido.
  {
    files: ['packages/desktop/electron/*.test.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
