import { app, BrowserWindow, ipcMain, session } from 'electron';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readToken, writeToken, clearToken } from './secure-token-store';
import { appendErrorLog, exportErrorLog } from './error-log-store';
import { initAutoUpdater, restartAndInstall } from './updater';
import { initBackendManager, shutdownBackend } from './backend-manager';

// main.ts orquesta electron puro (ventana, IPC, ciclo de vida de la app) —
// nada de esto se ejercitaba antes salvo indirectamente vía Playwright, que
// además corre con NODE_ENV=test saltándose el plugin de electron por
// completo (ver vite.config.mts), así que este archivo nunca se importaba en
// ningún test. Se mockea 'electron' entero (mismo criterio que
// secure-token-store.test.ts) para poder invocar a mano los handlers que
// main.ts registra, sin un proceso Electron real.
vi.mock('electron', () => {
  // Función real (no arrow) a propósito: main.ts la invoca con `new
  // BrowserWindow(...)`, y una arrow function nunca puede ser constructor
  // — con `new` sobre una función normal que hace `return {...}`, JS usa
  // ese objeto devuelto como la instancia (regla estándar de `new`).
  const BrowserWindowMock = vi.fn(function BrowserWindow() {
    return {
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      webContents: {
        setWindowOpenHandler: vi.fn(),
        on: vi.fn(),
        send: vi.fn(),
      },
    };
  }) as unknown as typeof import('electron').BrowserWindow;
  (
    BrowserWindowMock as unknown as { getAllWindows: () => unknown[] }
  ).getAllWindows = vi.fn(() => []);

  return {
    app: {
      quit: vi.fn(),
      on: vi.fn(),
      whenReady: vi.fn().mockResolvedValue(undefined),
    },
    BrowserWindow: BrowserWindowMock,
    ipcMain: { handle: vi.fn() },
    session: {
      defaultSession: {
        webRequest: { onHeadersReceived: vi.fn() },
      },
    },
  };
});

vi.mock('./secure-token-store', () => ({
  readToken: vi.fn(() => 'stored-token'),
  writeToken: vi.fn(),
  clearToken: vi.fn(),
}));

vi.mock('./error-log-store', () => ({
  appendErrorLog: vi.fn(),
  exportErrorLog: vi.fn().mockResolvedValue({ ok: true, path: '/tmp/log' }),
}));

vi.mock('./updater', () => ({
  initAutoUpdater: vi.fn(),
  restartAndInstall: vi.fn(),
}));

vi.mock('./backend-manager', () => ({
  initBackendManager: vi.fn(),
  shutdownBackend: vi.fn().mockResolvedValue(undefined),
}));

function ipcHandler(channel: string) {
  const call = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([registered]) => registered === channel);
  if (!call) {
    throw new Error(`No handler registered for channel "${channel}"`);
  }
  return call[1] as (event: unknown, ...args: unknown[]) => unknown;
}

function appOnHandlers(event: string) {
  return vi
    .mocked(app.on)
    .mock.calls.filter(([registered]) => registered === event)
    .map(([, handler]) => handler as (...args: unknown[]) => void);
}

function processListener(
  event: 'uncaughtException' | 'unhandledRejection',
): (...args: unknown[]) => void {
  // Ramificado (no `process.listeners(event)` con el union directo) porque
  // los overloads reales de Node para 'uncaughtException'/'unhandledRejection'
  // no resuelven bien contra un parámetro de tipo unión.
  const listeners =
    event === 'uncaughtException'
      ? process.listeners('uncaughtException')
      : process.listeners('unhandledRejection');
  return listeners[listeners.length - 1] as (...args: unknown[]) => void;
}

// process.env.VITE_DEV_SERVER_URL es `readonly` en electron-env.d.ts
// (vite-plugin-electron) — real y correcto para el código de producción,
// pero este test sí necesita simular ambos escenarios (dev/empaquetado).
function setViteDevServerUrl(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env.VITE_DEV_SERVER_URL;
  } else {
    env.VITE_DEV_SERVER_URL = value;
  }
}

// La instancia devuelta por `new BrowserWindow(...)` en el mock de arriba —
// tipada a propósito como esto (no como el `BrowserWindow` real importado
// de 'electron', con su superficie completa) porque es la única forma que
// el mock realmente expone en runtime.
interface FakeWindow {
  loadURL: ReturnType<typeof vi.fn>;
  loadFile: ReturnType<typeof vi.fn>;
  webContents: {
    setWindowOpenHandler: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

function lastConstructedWindow(): FakeWindow {
  const results = vi.mocked(BrowserWindow).mock.results;
  return results[results.length - 1].value as FakeWindow;
}

// Un solo import real de main.ts para todo este describe — los side effects
// del módulo (ipcMain.handle x6, process.on, app.on, app.whenReady().then)
// corren una única vez al importarlo, como en la app real.
describe('electron/main (packaged, sin VITE_DEV_SERVER_URL)', () => {
  let win: FakeWindow;

  beforeAll(async () => {
    setViteDevServerUrl(undefined);
    await import('./main');
    await vi.waitFor(() => {
      expect(BrowserWindow).toHaveBeenCalled();
    });
    win = lastConstructedWindow();
  });

  it('crea la ventana con loadFile (no loadURL) fuera de dev', () => {
    expect(win.loadFile).toHaveBeenCalled();
    expect(win.loadURL).not.toHaveBeenCalled();
  });

  it('registra un Content-Security-Policy real en producción', () => {
    const onHeadersReceived = vi.mocked(
      session.defaultSession.webRequest.onHeadersReceived,
    );
    expect(onHeadersReceived).toHaveBeenCalled();

    // Non-null: el tipo real de Electron permite `null` como "sin listener
    // registrado" — acá siempre hay uno, es justo lo que la línea de arriba
    // confirma.
    const callback = onHeadersReceived.mock.calls[0][0]!;
    const respond = vi.fn();
    callback({ responseHeaders: {} } as never, respond as never);

    const headers = respond.mock.calls[0][0] as {
      responseHeaders: Record<string, string[]>;
    };
    const csp = headers.responseHeaders['Content-Security-Policy'][0];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it('inicia el auto-updater fuera de dev', () => {
    expect(initAutoUpdater).toHaveBeenCalledWith(win);
  });

  it('inicia el backend-manager fuera de dev', () => {
    expect(initBackendManager).toHaveBeenCalledWith(win);
  });

  it('deniega abrir ventanas nuevas', () => {
    const handler = vi.mocked(win.webContents.setWindowOpenHandler).mock
      .calls[0][0];
    expect(handler({} as never)).toEqual({ action: 'deny' });
  });

  it('bloquea will-navigate fuera de file://, permite file://', () => {
    const willNavigate = vi
      .mocked(win.webContents.on)
      .mock.calls.find(([event]) => event === 'will-navigate')?.[1] as (
      event: { preventDefault: () => void },
      url: string,
    ) => void;

    const blocked = { preventDefault: vi.fn() };
    willNavigate(blocked, 'https://evil.example.com');
    expect(blocked.preventDefault).toHaveBeenCalled();

    const allowed = { preventDefault: vi.fn() };
    willNavigate(allowed, 'file:///C:/app/dist/index.html');
    expect(allowed.preventDefault).not.toHaveBeenCalled();
  });

  it('auth-token:get delega en readToken()', () => {
    expect(ipcHandler('auth-token:get')(null)).toBe('stored-token');
    expect(readToken).toHaveBeenCalled();
  });

  it('auth-token:set escribe un token válido', () => {
    ipcHandler('auth-token:set')(null, 'jwt-xyz');
    expect(writeToken).toHaveBeenCalledWith('jwt-xyz');
  });

  it('auth-token:set rechaza un payload que no es string', () => {
    expect(() =>
      ipcHandler('auth-token:set')(null, { not: 'a string' }),
    ).toThrow(/debe ser un string/);
    expect(writeToken).not.toHaveBeenCalledWith({ not: 'a string' });
  });

  it('auth-token:clear delega en clearToken()', () => {
    ipcHandler('auth-token:clear')(null);
    expect(clearToken).toHaveBeenCalled();
  });

  it('error-log:report valida forma y agrega source: "renderer"', () => {
    ipcHandler('error-log:report')(null, {
      type: 'react.componentDidCatch',
      message: 'boom',
      stack: 'at foo',
    });
    expect(appendErrorLog).toHaveBeenCalledWith({
      type: 'react.componentDidCatch',
      message: 'boom',
      stack: 'at foo',
      source: 'renderer',
    });
  });

  it('error-log:report rechaza un payload sin forma de LoggedError', () => {
    expect(() =>
      ipcHandler('error-log:report')(null, { message: 'sin type' }),
    ).toThrow(/debe ser un string/);
  });

  it('error-log:export delega en exportErrorLog()', async () => {
    await expect(ipcHandler('error-log:export')(null)).resolves.toEqual({
      ok: true,
      path: '/tmp/log',
    });
    expect(exportErrorLog).toHaveBeenCalled();
  });

  it('updater:restart delega en restartAndInstall()', async () => {
    await ipcHandler('updater:restart')(null);
    expect(restartAndInstall).toHaveBeenCalled();
  });

  it('uncaughtException se registra localmente', () => {
    const error = new Error('crash');
    processListener('uncaughtException')(error);
    expect(appendErrorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'main',
        type: 'uncaughtException',
        message: 'crash',
      }),
    );
  });

  it('unhandledRejection se registra localmente, incluso sin un Error real', () => {
    processListener('unhandledRejection')('string rejection');
    expect(appendErrorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'main',
        type: 'unhandledRejection',
        message: 'string rejection',
      }),
    );
  });

  it('render-process-gone se registra localmente con reason y exitCode', () => {
    const [renderProcessGone] = appOnHandlers('render-process-gone');
    renderProcessGone({}, {}, { reason: 'crashed', exitCode: 1 });
    expect(appendErrorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'renderer',
        type: 'render-process-gone',
        message: 'reason=crashed exitCode=1',
      }),
    );
  });

  it('window-all-closed para el backend y después cierra la app fuera de macOS', async () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.mocked(app.quit).mockClear();
    vi.mocked(shutdownBackend).mockClear();

    const [windowAllClosed] = appOnHandlers('window-all-closed');
    windowAllClosed();
    // shutdownBackend() es async -- app.quit() solo debe llamarse después de
    // que resuelva, nunca antes (dejaría Postgres/el backend corriendo).
    expect(app.quit).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(app.quit).toHaveBeenCalled();
    });
    expect(shutdownBackend).toHaveBeenCalled();

    Object.defineProperty(process, 'platform', { value: original });
  });

  it('window-all-closed NO cierra la app en macOS', () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    vi.mocked(app.quit).mockClear();

    const [windowAllClosed] = appOnHandlers('window-all-closed');
    windowAllClosed();
    expect(app.quit).not.toHaveBeenCalled();

    Object.defineProperty(process, 'platform', { value: original });
  });

  it('activate crea una ventana nueva cuando no hay ninguna abierta', () => {
    vi.mocked(BrowserWindow).mockClear();
    vi.mocked(
      BrowserWindow as unknown as { getAllWindows: () => unknown[] },
    ).getAllWindows.mockReturnValueOnce([]);

    const [activate] = appOnHandlers('activate');
    activate();
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
  });
});

describe('electron/main (dev, con VITE_DEV_SERVER_URL)', () => {
  afterEach(() => {
    setViteDevServerUrl(undefined);
  });

  it('carga loadURL, y NO registra CSP ni auto-updater', async () => {
    vi.resetModules();
    vi.mocked(BrowserWindow).mockClear();
    vi.mocked(session.defaultSession.webRequest.onHeadersReceived).mockClear();
    vi.mocked(initAutoUpdater).mockClear();
    vi.mocked(initBackendManager).mockClear();
    setViteDevServerUrl('http://localhost:5173');

    await import('./main');
    await vi.waitFor(() => {
      expect(BrowserWindow).toHaveBeenCalled();
    });
    const win = lastConstructedWindow();

    expect(win.loadURL).toHaveBeenCalledWith('http://localhost:5173');
    expect(win.loadFile).not.toHaveBeenCalled();
    expect(
      session.defaultSession.webRequest.onHeadersReceived,
    ).not.toHaveBeenCalled();
    expect(initAutoUpdater).not.toHaveBeenCalled();
    expect(initBackendManager).not.toHaveBeenCalled();
  });

  it('window-all-closed cierra la app directo en dev, sin tocar el backend', async () => {
    // Reimporta con VITE_DEV_SERVER_URL puesto (mismo patrón que el test de
    // arriba) en vez de reusar el handler de un test anterior -- así este
    // test sigue siendo correcto sin importar el orden en que corran.
    vi.resetModules();
    vi.mocked(app.quit).mockClear();
    vi.mocked(shutdownBackend).mockClear();
    setViteDevServerUrl('http://localhost:5173');

    await import('./main');
    await vi.waitFor(() => {
      expect(BrowserWindow).toHaveBeenCalled();
    });

    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const handlers = appOnHandlers('window-all-closed');
    handlers[handlers.length - 1]();

    expect(app.quit).toHaveBeenCalled();
    expect(shutdownBackend).not.toHaveBeenCalled();

    Object.defineProperty(process, 'platform', { value: original });
  });
});
