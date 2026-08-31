/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string;
    /** /dist/ or /public/ */
    VITE_PUBLIC: string;
  }
}

// Used in Renderer process, exposed in `preload.ts`
interface Window {
  authToken: {
    get(): Promise<string | null>;
    set(token: string): Promise<void>;
    clear(): Promise<void>;
  };
  appLogs: {
    reportError(entry: {
      type: string;
      message: string;
      stack?: string;
    }): Promise<void>;
    export(): Promise<{ ok: boolean; path?: string; reason?: string }>;
  };
  appUpdater: {
    onUpdateReady(callback: (version: string) => void): void;
    restartAndInstall(): Promise<void>;
  };
  appBackend: {
    getStatus(): Promise<BackendStatus>;
    onStatusChange(callback: (status: BackendStatus) => void): void;
    retry(): Promise<void>;
  };
}

// Solo existe en el build empaquetado -- electron/backend-manager.ts (fase
// Electron) levanta Postgres + el backend en segundo plano y reporta su
// progreso por acá. 'starting' cubre tanto "arrancando Postgres" como
// "corriendo migraciones" como "esperando /health" -- el mensaje distingue
// el paso puntual, el estado en sí no necesita más granularidad que esa.
interface BackendStatus {
  state: 'starting' | 'ready' | 'error';
  message?: string;
}
