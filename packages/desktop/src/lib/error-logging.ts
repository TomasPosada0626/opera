// Contraparte del renderer para la observabilidad local del proceso
// principal (electron/error-log-store.ts): atrapa lo que React/el navegador
// no atrapan por su cuenta y lo manda al mismo archivo que ya juntan los
// errores del proceso principal. `window.appLogs` no existe fuera de
// Electron (jsdom en tests, o si algún día esto corriera en un navegador
// suelto) — noop en ese caso, mismo patrón que auth-token.ts con
// `window.authToken`.
export function initErrorLogging(): void {
  if (typeof window === 'undefined' || !window.appLogs) {
    return;
  }

  window.addEventListener('error', (event) => {
    void window.appLogs.reportError({
      type: 'window.onerror',
      message: event.message,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    void window.appLogs.reportError({
      type: 'unhandledrejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
