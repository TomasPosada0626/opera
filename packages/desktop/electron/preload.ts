import { ipcRenderer, contextBridge } from 'electron';

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    // `Parameters<typeof ipcRenderer.X>` resolves to Electron's loosely-typed
    // overload, so the rest args come back as `any[]` — not a real unsafe call.
    return ipcRenderer.on(channel, (event, ...args) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      listener(event, ...args),
    );
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return ipcRenderer.invoke(channel, ...omit);
  },
});
