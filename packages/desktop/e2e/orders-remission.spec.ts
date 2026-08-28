import { execSync } from 'node:child_process';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const BACKEND_DIR = path.resolve(__dirname, '../../backend');

// Requiere el backend real corriendo en localhost:3000 contra Postgres real
// (VITE_API_URL por defecto, ver lib/api-client.ts) — mismo criterio que
// production-to-inventory.spec.ts: Vite lo levanta este mismo config
// (playwright.config.ts), pero el backend queda fuera a propósito.
interface FixtureState {
  email: string;
  password: string;
  warehouseName: string;
  customerName: string;
  productSku: string;
  productName: string;
}

let fixtures: FixtureState;

test.beforeAll(() => {
  const output = execSync('pnpm run e2e:fixtures:orders:setup', {
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
  execSync('pnpm run e2e:fixtures:orders:teardown', { cwd: BACKEND_DIR });
});

test('un pedido despachado parcialmente por remisión mueve stock real (#54/#99)', async ({
  page,
}) => {
  // 1. Login real por la UI (no un token inyectado).
  await page.goto('/#/login');
  await page.getByLabel('Correo').fill(fixtures.email);
  await page.getByLabel('Contraseña').fill(fixtures.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // 2. Crear el pedido por el formulario real: cliente + bodega + producto +
  // cantidad (5) de la fábrica de datos.
  await page.goto('/#/pedidos');
  await page.getByRole('button', { name: 'Nuevo pedido' }).click();

  await page.getByLabel('Buscar cliente').fill(fixtures.customerName);
  await page
    .getByRole('button', { name: fixtures.customerName, exact: true })
    .click();

  // Sin selección manual de bodega: el fixture crea exactamente una, y
  // WarehouseSelect la auto-selecciona y oculta el campo cuando solo hay
  // una activa (ver components/form/WarehouseSelect.tsx) — un `getByLabel
  // ('Bodega')` acá esperaría un <select> que nunca se renderiza.
  await page.getByLabel('Buscar producto').fill(fixtures.productSku);
  await page
    .getByRole('button', { name: new RegExp(fixtures.productSku) })
    .click();

  await page.getByLabel('Cantidad línea 1').fill('5');
  await page.getByLabel('Precio unitario línea 1').fill('100');
  await page.getByRole('button', { name: 'Crear pedido' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // 3. Entrar al detalle del pedido recién creado — se identifica por el
  // nombre del cliente (único, con timestamp).
  const orderRow = page.getByRole('row', {
    name: new RegExp(fixtures.customerName),
  });
  await orderRow.getByRole('link', { name: 'Ver detalle' }).click();
  await expect(
    page.getByRole('heading', { name: fixtures.customerName }),
  ).toBeVisible();

  // 4. Marcar en producción, luego enviado a almacén — el pedido nace
  // PENDIENTE y ninguna de las dos transiciones mueve stock por sí misma
  // salvo la segunda (ver orders.service.ts: markWarehoused sí escribe la
  // ENTRADA del terminado).
  await page.getByRole('button', { name: 'Marcar en producción' }).click();
  await expect(page.getByText('En producción', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Marcar enviado a almacén' }).click();
  await expect(page.getByText('En almacén', { exact: true })).toBeVisible();

  // 5. Despachar parcialmente (3 de 5) vía la remisión real.
  await page.getByRole('button', { name: 'Nueva remisión' }).click();
  await page
    .getByLabel(`Cantidad a entregar de ${fixtures.productName}`)
    .fill('3');
  await page.getByRole('button', { name: 'Crear remisión' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // 6. La remisión aparece en el listado del pedido con la cantidad
  // correcta reflejada en la columna "Entregado" de la línea.
  await expect(page.getByText(/Remisión No\. \d+/)).toBeVisible();
  const itemRow = page.getByRole('row', {
    name: new RegExp(fixtures.productSku),
  });
  await expect(itemRow.locator('td').nth(2)).toHaveText('3');

  // 7. Bonus: el link "Imprimir" navega a la vista de impresión real y
  // muestra la remisión — ruta hoy sin cobertura.
  await page.getByRole('link', { name: 'Imprimir' }).click();
  await expect(page).toHaveURL(/#\/imprimir-remision\?id=/);
  await expect(page.getByRole('heading', { name: 'Remisión' })).toBeVisible();
  await expect(page.getByText(new RegExp(fixtures.productSku))).toBeVisible();

  // 8. Verificar en Inventario que el stock refleja el flujo completo: 20
  // iniciales (fixture) + 5 entrados al pasar a EN_ALMACEN - 3 despachados
  // en la remisión = 22.
  await page.goto('/#/inventario');
  const searchBox = page.getByLabel('Buscar productos');
  await searchBox.fill(fixtures.productSku);
  await expect(
    page.getByRole('row', { name: new RegExp(fixtures.productSku) }),
  ).toContainText('22');
});
