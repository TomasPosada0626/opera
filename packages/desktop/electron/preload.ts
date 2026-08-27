import { contextBridge, ipcRenderer } from 'electron';

// API acotada por canal (#92) — antes exponía `ipcRenderer` completo
// (on/off/send/invoke) vía contextBridge sin que nada en el renderer lo
// usara. Hoy el único secreto que cruza el puente es el JWT de sesión, así
// que solo esos tres canales quedan expuestos.
contextBridge.exposeInMainWorld('authToken', {
  get: (): Promise<string | null> => ipcRenderer.invoke('auth-token:get'),
  set: (token: string): Promise<void> =>
    ipcRenderer.invoke('auth-token:set', token),
  clear: (): Promise<void> => ipcRenderer.invoke('auth-token:clear'),
});

// Observabilidad local (sin dependencia de internet nueva, ver
// error-log-store.ts): el renderer reporta sus propios errores no
// atrapados, y puede pedir exportar el archivo completo a un lugar que la
// usuaria elija.
contextBridge.exposeInMainWorld('appLogs', {
  reportError: (entry: {
    type: string;
    message: string;
    stack?: string;
  }): Promise<void> => ipcRenderer.invoke('error-log:report', entry),
  export: (): Promise<{ ok: boolean; path?: string; reason?: string }> =>
    ipcRenderer.invoke('error-log:export'),
});
