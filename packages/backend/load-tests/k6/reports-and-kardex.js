// Load test del item 7 (rendimiento a escala): golpea los endpoints que de
// verdad les preocupan a Kardex/reportes/dashboard con datos multi-año —
// /dashboard/resumen y /reports/inventario recorren TODO el historial de
// cada producto vía InventoryService.getAverageCost() (ver comentario en
// inventory.service.ts), así que son los que más deberían sufrir con
// volumen. /inventory/:id/kardex y /inventory/:id/stock se muestrean sobre
// productos reales del dataset generado por generate-dataset.ts.
//
// Concurrencia deliberadamente baja (ver `scenarios` abajo): Opera es
// LAN-first para un solo local (ver PRODUCT.md) — el objetivo no es
// simular miles de usuarios, sino confirmar que CADA request individual
// responde en un tiempo razonable una vez que el histórico crece a años de
// operación real. Además /auth/login y el límite global de requests/min
// por IP (ver ThrottlerModule en app.module.ts) hacen que simular alta
// concurrencia contra el techo de producción no tenga sentido — para esto,
// arranca el backend con RATE_LIMIT_PER_MINUTE alto (ver README de esta
// carpeta).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { login, authHeaders, BASE_URL } from './lib.js';

const dataset = JSON.parse(open('../.dataset.json'));

export const options = {
  scenarios: {
    dashboard: {
      executor: 'constant-vus',
      exec: 'dashboard',
      vus: 2,
      duration: '30s',
    },
    reports: {
      executor: 'constant-vus',
      exec: 'reports',
      vus: 2,
      duration: '30s',
      startTime: '30s',
    },
    kardex: {
      executor: 'constant-vus',
      exec: 'kardex',
      vus: 3,
      duration: '30s',
      startTime: '60s',
    },
  },
  thresholds: {
    // p95 recomendado para una pantalla que un usuario mira mientras
    // espera — no un SLA formal, solo el techo de "se siente lento".
    'http_req_duration{endpoint:dashboard}': ['p(95)<2000'],
    'http_req_duration{endpoint:inventario}': ['p(95)<2000'],
    'http_req_duration{endpoint:kardex}': ['p(95)<800'],
    'http_req_duration{endpoint:stock}': ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  return { token: login() };
}

export function dashboard(data) {
  const res = http.get(`${BASE_URL}/dashboard/resumen`, {
    ...authHeaders(data.token),
    tags: { endpoint: 'dashboard' },
  });
  check(res, { 'dashboard 200': (r) => r.status === 200 });
  sleep(1);
}

export function reports(data) {
  const inventario = http.get(`${BASE_URL}/reports/inventario`, {
    ...authHeaders(data.token),
    tags: { endpoint: 'inventario' },
  });
  check(inventario, { 'inventario 200': (r) => r.status === 200 });

  const ventas = http.get(`${BASE_URL}/reports/ventas`, {
    ...authHeaders(data.token),
    tags: { endpoint: 'ventas' },
  });
  check(ventas, { 'ventas 200': (r) => r.status === 200 });

  const topProductos = http.get(`${BASE_URL}/reports/productos-mas-vendidos`, {
    ...authHeaders(data.token),
    tags: { endpoint: 'top-productos' },
  });
  check(topProductos, { 'top-productos 200': (r) => r.status === 200 });

  sleep(1);
}

export function kardex(data) {
  const productId =
    dataset.sampleProductIds[
      Math.floor(Math.random() * dataset.sampleProductIds.length)
    ];

  const stock = http.get(`${BASE_URL}/inventory/${productId}/stock`, {
    ...authHeaders(data.token),
    tags: { endpoint: 'stock' },
  });
  check(stock, { 'stock 200': (r) => r.status === 200 });

  const kardexRes = http.get(
    `${BASE_URL}/inventory/${productId}/kardex?page=1&pageSize=50`,
    { ...authHeaders(data.token), tags: { endpoint: 'kardex' } },
  );
  check(kardexRes, { 'kardex 200': (r) => r.status === 200 });

  sleep(0.5);
}
