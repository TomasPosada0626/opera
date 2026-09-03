import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mismo patrón que secure-token-store.test.ts: fuera de un proceso Electron
// real, `electron` no existe -- se mockea contextBridge/ipcRenderer y se
// captura qué quedó expuesto en cada `exposeInMainWorld`.
const exposed: Record<string, unknown> = {};
const invokeMock = vi.fn();
const onMock = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => {
      exposed[name] = api;
    },
  },
  ipcRenderer: { invoke: invokeMock, on: onMock },
}));

// `VITE_DEV_SERVER_URL` es `readonly` en electron-env.d.ts (vite-plugin-electron)
// -- real y correcto para el código de producción, pero este test sí
// necesita simular ambos escenarios (dev/empaquetado). Mismo patrón que
// `setViteDevServerUrl` en main.test.ts.
function setViteDevServerUrl(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env.VITE_DEV_SERVER_URL;
  } else {
    env.VITE_DEV_SERVER_URL = value;
  }
}

describe('preload', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of Object.keys(exposed)) delete exposed[key];
    invokeMock.mockReset();
    onMock.mockReset();
    setViteDevServerUrl(undefined);
  });

  afterEach(() => {
    setViteDevServerUrl(undefined);
  });

  // Regresión de la auditoría 2026-09-01 (ronda 2): esta es la única lógica
  // condicional real del archivo -- sin cubrirla, un typo en el nombre de la
  // env var rompería en silencio la pantalla de arranque del instalador
  // empaquetado (App.tsx esperaría para siempre un `window.appBackend` que
  // nunca se expuso) o, al revés, dejaría el puente expuesto en dev.
  it('expone window.appBackend cuando no hay VITE_DEV_SERVER_URL (empaquetado)', async () => {
    await import('./preload');

    expect(exposed['appBackend']).toBeDefined();
  });

  it('no expone window.appBackend cuando VITE_DEV_SERVER_URL está seteado (dev)', async () => {
    setViteDevServerUrl('http://localhost:5173');

    await import('./preload');

    expect(exposed['appBackend']).toBeUndefined();
  });

  it('authToken/appLogs/appUpdater se exponen siempre, en dev y empaquetado', async () => {
    setViteDevServerUrl('http://localhost:5173');

    await import('./preload');

    expect(exposed['authToken']).toBeDefined();
    expect(exposed['appLogs']).toBeDefined();
    expect(exposed['appUpdater']).toBeDefined();
  });

  it('cada método del puente invoca el canal IPC correcto', async () => {
    await import('./preload');

    const authToken = exposed['authToken'] as {
      get: () => Promise<string | null>;
      set: (token: string) => Promise<void>;
      clear: () => Promise<void>;
    };
    void authToken.get();
    expect(invokeMock).toHaveBeenCalledWith('auth-token:get');
    void authToken.set('jwt-abc');
    expect(invokeMock).toHaveBeenCalledWith('auth-token:set', 'jwt-abc');
    void authToken.clear();
    expect(invokeMock).toHaveBeenCalledWith('auth-token:clear');

    const appLogs = exposed['appLogs'] as {
      reportError: (entry: { type: string; message: string }) => Promise<void>;
      export: () => Promise<{ ok: boolean }>;
    };
    const entry = { type: 'renderer', message: 'boom' };
    void appLogs.reportError(entry);
    expect(invokeMock).toHaveBeenCalledWith('error-log:report', entry);
    void appLogs.export();
    expect(invokeMock).toHaveBeenCalledWith('error-log:export');

    const appUpdater = exposed['appUpdater'] as {
      onUpdateReady: (cb: (version: string) => void) => void;
      restartAndInstall: () => Promise<void>;
    };
    const versionCallback = vi.fn();
    appUpdater.onUpdateReady(versionCallback);
    const [updaterChannel, updaterListener] = onMock.mock.calls[0] as [
      string,
      (event: unknown, info: { version: string }) => void,
    ];
    expect(updaterChannel).toBe('updater:downloaded');
    updaterListener(undefined, { version: '1.2.3' });
    expect(versionCallback).toHaveBeenCalledWith('1.2.3');
    void appUpdater.restartAndInstall();
    expect(invokeMock).toHaveBeenCalledWith('updater:restart');

    const appBackend = exposed['appBackend'] as {
      getStatus: () => Promise<unknown>;
      retry: () => Promise<void>;
      onStatusChange: (cb: (status: unknown) => void) => void;
    };
    void appBackend.getStatus();
    expect(invokeMock).toHaveBeenCalledWith('backend:get-status');
    void appBackend.retry();
    expect(invokeMock).toHaveBeenCalledWith('backend:retry');

    const statusCallback = vi.fn();
    appBackend.onStatusChange(statusCallback);
    const [channel, listener] = onMock.mock.calls[1] as [
      string,
      (event: unknown, status: unknown) => void,
    ];
    expect(channel).toBe('backend:status');
    listener(undefined, { state: 'ready' });
    expect(statusCallback).toHaveBeenCalledWith({ state: 'ready' });
  });
});
