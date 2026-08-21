// El JWT se cachea en memoria del renderer y se persiste vía IPC en el
// proceso principal, que lo cifra con `safeStorage` de Electron (#92) —
// nunca toca `localStorage` ni queda en texto plano en disco. En entornos
// sin puente de preload (tests con Vitest/jsdom) `window.authToken` no
// existe: se degrada a un cache en memoria que no sobrevive un refresh,
// que es justo lo que esos tests esperan.
let cachedToken: string | null = null;

// `createHashRouter` (router.tsx) dispara los loaders de la ruta inicial
// en cuanto se crea el router — al importarse el módulo, antes de que
// `main.tsx` llegue a montar React. Si cada loader llamara `initAuthToken`
// suelto, el primero en llegar dispararía el IPC y los demás (loaders en
// paralelo del mismo router-data, o una segunda pasada) verían el cache
// aún sin hidratar. Memoizar la promesa hace que awaitearla desde
// cualquier loader, sin importar cuándo se ejecute, espere siempre la
// misma hidratación en curso o ya resuelta.
let hydration: Promise<void> | undefined;

function bridge(): Window['authToken'] | undefined {
  return typeof window === 'undefined' ? undefined : window.authToken;
}

// Awaitear esto es obligatorio en todo loader que lea getAuthToken/
// getCurrentUser antes de decidir un redirect — no alcanza con esperarlo
// una vez en main.tsx (ver comentario arriba).
export function initAuthToken(): Promise<void> {
  hydration ??= (async () => {
    cachedToken = (await bridge()?.get()) ?? null;
  })();
  return hydration;
}

export function getAuthToken(): string | null {
  return cachedToken;
}

export function setAuthToken(token: string): void {
  cachedToken = token;
  void bridge()?.set(token);
}

export function clearAuthToken(): void {
  cachedToken = null;
  void bridge()?.clear();
}
