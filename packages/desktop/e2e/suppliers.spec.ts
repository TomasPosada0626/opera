import { execSync } from 'node:child_process';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const BACKEND_DIR = path.resolve(__dirname, '../../backend');

// Requiere el backend real corriendo en localhost:3000 contra Postgres real,
// mismo criterio que production-to-inventory.spec.ts.
interface FixtureState {
  email: string;
  password: string;
  productSku: string;
  productName: string;
}

let fixtures: FixtureState;

test.beforeAll(() => {
  const output = execSync('pnpm run e2e:fixtures:suppliers:setup', {
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
  execSync('pnpm run e2e:fixtures:suppliers:teardown', { cwd: BACKEND_DIR });
});

test('crear un proveedor, agregarle un precio, comprarle, recibir una parte y pagarle por la UI real', async ({
  page,
}) => {
  // 1. Login real por la UI.
  await page.goto('/#/login');
  await page.getByLabel('Correo').fill(fixtures.email);
  await page.getByLabel('Contraseña').fill(fixtures.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /^Buen[oa]s (días|tardes|noches)$/,
    }),
  ).toBeVisible();

  // 2. Crear el proveedor por el formulario real — nombre único con
  // timestamp para poder ubicarlo en la tabla sin ambigüedad.
  const supplierName = `PW Proveedor ${Date.now()}`;
  await page.goto('/#/proveedores');
  await page.getByRole('button', { name: 'Nuevo proveedor' }).click();
  await page.getByLabel('Nombre').fill(supplierName);
  await page.getByRole('button', { name: 'Crear proveedor' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const supplierRow = page.getByRole('row', { name: new RegExp(supplierName) });
  await expect(supplierRow).toBeVisible();

  // 3. Entrar al detalle del proveedor recién creado.
  await supplierRow.getByRole('link', { name: 'Ver detalle' }).click();
  await expect(page.getByRole('heading', { name: supplierName })).toBeVisible();

  // 4. Agregar un precio para el producto del fixture. Se acota al diálogo
  // porque el propio <div role="dialog"> lleva aria-label="Agregar precio",
  // que sin acotar hace ambiguo cualquier getByLabel que contenga "Precio".
  await page.getByRole('button', { name: 'Agregar precio' }).click();
  const priceDialog = page.getByRole('dialog');
  await priceDialog.getByLabel('Buscar producto').fill(fixtures.productSku);
  await priceDialog
    .getByRole('button', { name: new RegExp(fixtures.productSku) })
    .click();
  await priceDialog.getByLabel('Precio', { exact: true }).fill('150.5');
  await priceDialog.getByRole('button', { name: 'Guardar precio' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // 5. Verificar que el precio aparece en la lista de precios del proveedor
  // (primera tabla de la página; la segunda es la de compras).
  const priceTable = page.locator('table').first();
  const priceRow = priceTable.getByRole('row', {
    name: new RegExp(fixtures.productSku),
  });
  await expect(priceRow).toBeVisible();
  await expect(priceRow).toContainText('150,50'); // formato es-CO, coma decimal

  // 6. Registrar una compra de ese producto desde la ficha del proveedor.
  // El costo se llena solo con el precio cargado; se cambia por el de esta
  // compra. Al registrarla, la app abre el detalle de la compra.
  await page.getByRole('button', { name: 'Nueva compra' }).click();
  const purchaseDialog = page.getByRole('dialog');
  await purchaseDialog.getByLabel('Producto línea 1').fill(fixtures.productSku);
  await purchaseDialog
    .getByRole('button', { name: new RegExp(fixtures.productSku) })
    .click();
  await expect(purchaseDialog.getByLabel('Costo unitario línea 1')).toHaveValue(
    '150.5',
  );
  await purchaseDialog.getByLabel('Cantidad línea 1').fill('8');
  await purchaseDialog.getByLabel('Costo unitario línea 1').fill('42.25');
  await purchaseDialog
    .getByRole('button', { name: 'Registrar compra' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/#\/compras\/[0-9a-f-]+$/);
  await expect(page.getByRole('link', { name: supplierName })).toBeVisible();

  // 7. Llega solo una parte: 5 de 8. Entra al inventario y la compra queda
  // "Llegó una parte".
  await page.getByRole('button', { name: 'Recibir mercancía' }).click();
  const receiveDialog = page.getByRole('dialog');
  await receiveDialog
    .getByLabel(`Cantidad recibida de ${fixtures.productName}`)
    .fill('5');
  await receiveDialog
    .getByRole('button', { name: 'Recibir y sumar al inventario' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Llegó una parte').first()).toBeVisible();
  await expect(page.getByText(/^\+5/)).toBeVisible();

  // 8. Pagarle una parte de lo recibido. Recibido: 5 x 42,25 = 211,25;
  // pagado 100 -> por pagar 111,25.
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  const paymentDialog = page.getByRole('dialog');
  await paymentDialog.getByLabel('Monto').fill('100');
  await paymentDialog.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(/111,25/).first()).toBeVisible();
});
