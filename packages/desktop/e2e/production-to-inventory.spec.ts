import { execSync } from 'node:child_process';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const BACKEND_DIR = path.resolve(__dirname, '../../backend');

// Requiere el backend real corriendo en localhost:3000 contra Postgres real
// (VITE_API_URL por defecto, ver lib/api-client.ts) — Vite lo levanta este
// mismo config (playwright.config.ts), pero el backend queda fuera a
// propósito, mismo criterio que los e2e de Jest del backend requieren
// Postgres ya arriba en vez de intentar orquestarlo.
interface FixtureState {
  email: string;
  password: string;
  warehouseName: string;
  componentSku: string;
  finishedGoodSku: string;
}

let fixtures: FixtureState;

test.beforeAll(() => {
  const output = execSync('pnpm run e2e:fixtures:production:setup', {
    cwd: BACKEND_DIR,
  }).toString();
  // El script imprime warnings de pnpm además del JSON — el JSON siempre es
  // la última línea no vacía.
  const jsonLine = output
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .pop();
  if (!jsonLine) {
    throw new Error('El script de fixtures no imprimió el estado esperado');
  }
  fixtures = JSON.parse(jsonLine) as FixtureState;
});

test.afterAll(() => {
  execSync('pnpm run e2e:fixtures:production:teardown', { cwd: BACKEND_DIR });
});

test('completar una orden de producción consume el componente y entra el terminado al stock (#57)', async ({
  page,
}) => {
  // 1. Login real por la UI (no un token inyectado) — esto es lo que hace
  // a este test "end-to-end" y no solo otra prueba de integración HTTP.
  await page.goto('/#/login');
  await page.getByLabel('Correo').fill(fixtures.email);
  await page.getByLabel('Contraseña').fill(fixtures.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // 2. Crear la orden de producción por el formulario real.
  await page.goto('/#/produccion');
  await page.getByRole('button', { name: 'Nueva orden' }).click();
  await page.getByLabel('Buscar producto').fill(fixtures.finishedGoodSku);
  await page
    .getByRole('button', { name: new RegExp(fixtures.finishedGoodSku) })
    .click();
  // Sin selección manual de bodega: el fixture crea exactamente una, y
  // WarehouseSelect la auto-selecciona y oculta el campo cuando solo hay
  // una activa (ver components/form/WarehouseSelect.tsx) — un `getByLabel
  // ('Bodega')` acá esperaría un <select> que nunca se renderiza.
  await page.getByLabel('Cantidad a producir').fill('3');
  await page.getByRole('button', { name: 'Crear orden' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // 3. Completar esa orden — consume 3*2=6 del componente, entra 3 del
  // terminado. La fila se identifica por el SKU del terminado (único, con
  // timestamp) en cualquier columna de texto de esa fila.
  const orderRow = page.getByRole('row', {
    name: new RegExp(fixtures.finishedGoodSku),
  });
  await orderRow.getByRole('button', { name: 'Completar' }).click();
  await expect(orderRow.getByText('Completada')).toBeVisible();

  // 4. Verificar en Inventario que el stock refleja el consumo/entrada real
  // — el propósito completo de este test (#57).
  await page.goto('/#/inventario');
  const searchBox = page.getByLabel('Buscar productos');

  await searchBox.fill(fixtures.componentSku);
  await expect(
    page.getByRole('row', { name: new RegExp(fixtures.componentSku) }),
  ).toContainText('4'); // 10 iniciales - 3*2 consumidos = 4

  await searchBox.fill(fixtures.finishedGoodSku);
  await expect(
    page.getByRole('row', { name: new RegExp(fixtures.finishedGoodSku) }),
  ).toContainText('3'); // 3 unidades producidas
});
