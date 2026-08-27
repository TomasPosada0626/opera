// Helpers compartidos por los scripts de k6 de esta carpeta. Un solo login
// en setup() (no uno por VU/iteración) porque /auth/login tiene su propio
// límite de 5/min por IP (ver AuthController) — reusar el mismo JWT para
// todas las iteraciones es la única forma de correr el resto de la carga.
import http from 'k6/http';
import { check, fail } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function login() {
  const email = __ENV.LOADTEST_ADMIN_EMAIL || 'loadtest-admin@opera.local';
  const password = __ENV.LOADTEST_ADMIN_PASSWORD || 'LoadTest-password-123!';

  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (
    !check(res, {
      'login succeeded': (r) => r.status === 200,
    })
  ) {
    fail(`login failed: ${res.status} ${res.body}`);
  }

  return res.json('accessToken');
}

export function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}
