// Almacenamiento simple del JWT en localStorage — suficiente para el alcance
// actual (#38). Aislado en este único módulo para poder migrar a algo más
// seguro (p. ej. Electron safeStorage vía el proceso principal) más adelante
// sin tocar el código que llama a la API.
const TOKEN_KEY = 'opera.accessToken';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
