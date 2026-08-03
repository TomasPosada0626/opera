import { getAuthToken } from './auth-token';

export interface CurrentUser {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
}

// El JWT no está cifrado, solo firmado — decodificar su payload en el
// cliente para mostrar datos (email, rol activo) es seguro porque el
// servidor SIEMPRE revalida la firma y el estado del usuario en cada
// request real (ver JwtStrategy.validate en el backend). Esto es solo
// para decidir qué mostrar en la UI, nunca una decisión de autorización
// real — esa la sigue haciendo el backend en cada endpoint.
function decodeJwtPayload(token: string): CurrentUser | null {
  try {
    const [, payloadBase64] = token.split('.');
    if (!payloadBase64) {
      return null;
    }
    return JSON.parse(atob(payloadBase64)) as CurrentUser;
  } catch {
    return null;
  }
}

// No es un hook (sin useState/useEffect) a propósito — es una lectura
// síncrona de localStorage que solo cambia entre navegaciones (login/
// logout), y esas ya remontan el árbol de rutas.
export function getCurrentUser(): CurrentUser | null {
  const token = getAuthToken();
  return token ? decodeJwtPayload(token) : null;
}
