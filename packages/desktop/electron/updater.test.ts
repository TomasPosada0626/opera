import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fuera de un proceso Electron real no hay ningún `electron-updater` real
// que hable con GitHub — se mockea como un emisor de eventos minimalista
// (sin `node:events`: `vi.hoisted` se ejecuta antes de que CUALQUIER import
// de este archivo, incluido ese, quede inicializado) para poder disparar
// 'update-downloaded'/'error' a mano, igual que secure-token-store.test.ts
// mockea `electron` completo.
const { autoUpdater, appendErrorLogMock } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emitter = {
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
    on(event: string, listener: (...args: unknown[]) => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return emitter;
    },
    removeAllListeners() {
      listeners.clear();
    },
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    },
  };
  return { autoUpdater: emitter, appendErrorLogMock: vi.fn() };
});

vi.mock('electron-updater', () => ({ autoUpdater }));
vi.mock('./error-log-store', () => ({ appendErrorLog: appendErrorLogMock }));

const { initAutoUpdater, restartAndInstall } = await import('./updater');

function fakeWindow() {
  return { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
}

describe('updater', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(autoUpdater.checkForUpdates).mockClear();
    vi.mocked(autoUpdater.quitAndInstall).mockClear();
    appendErrorLogMock.mockClear();
    autoUpdater.removeAllListeners();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks for updates immediately on init', () => {
    initAutoUpdater(fakeWindow());

    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('checks again every 6 horas', () => {
    initAutoUpdater(fakeWindow());
    vi.mocked(autoUpdater.checkForUpdates).mockClear();

    vi.advanceTimersByTime(6 * 60 * 60 * 1000);

    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('enables autoInstallOnAppQuit', () => {
    initAutoUpdater(fakeWindow());

    expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  it('notifies the renderer via updater:downloaded when an update finishes downloading', () => {
    const win = fakeWindow();
    initAutoUpdater(win);

    autoUpdater.emit('update-downloaded', { version: '1.2.3' });

    expect(win.webContents.send).toHaveBeenCalledWith('updater:downloaded', {
      version: '1.2.3',
    });
  });

  it('logs autoUpdater errors locally instead of throwing or interrupting', () => {
    initAutoUpdater(fakeWindow());

    autoUpdater.emit('error', new Error('network unreachable'));

    expect(appendErrorLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'main',
        type: 'autoUpdater',
        message: 'network unreachable',
      }),
    );
  });

  it('never rejects when checkForUpdates fails (already handled via the error event)', async () => {
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValueOnce(
      new Error('offline'),
    );

    expect(() => initAutoUpdater(fakeWindow())).not.toThrow();
    await vi.waitFor(() => {
      expect(autoUpdater.checkForUpdates).toHaveBeenCalled();
    });
  });

  it('restartAndInstall delegates to autoUpdater.quitAndInstall', () => {
    restartAndInstall();

    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
