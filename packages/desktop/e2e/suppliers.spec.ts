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

test('crear un proveedor, agregarle un precio y registrar una compra por la UI real', async ({
  page,
}) => {
  // 1. Login real por la UI.
  await page.goto('/#/login');
  await page.getByLabel('Correo').fill(fixtures.email);
  await page.getByLabel('Contraseña').fill(fixtures.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

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

  // 5. Verificar que el precio aparece en la lista de precios del proveedor.
  // Se busca dentro de la primera tabla (Precios por producto) porque una
  // vez exista también la compra, la segunda tabla (Bitácora de compras)
  // tendrá una fila con el mismo SKU y un `getByRole('row', ...)` sin
  // acotar sería ambiguo.
  const priceTable = page.locator('table').first();
  const priceRow = priceTable.getByRole('row', {
    name: new RegExp(fixtures.productSku),
  });
  await expect(priceRow).toBeVisible();
  await expect(priceRow).toContainText('150,50'); // formato es-CO, coma decimal

  // 6. Registrar una compra de ese producto. El botón que abre el modal y
  // el botón de submit dentro del formulario comparten el mismo texto
  // ("Registrar compra"), así que el submit se busca acotado al diálogo.
  await page.getByRole('button', { name: 'Registrar compra' }).click();
  const purchaseDialog = page.getByRole('dialog');
  await purchaseDialog.getByLabel('Buscar producto').fill(fixtures.productSku);
  await purchaseDialog
    .getByRole('button', { name: new RegExp(fixtures.productSku) })
    .click();
  await purchaseDialog.getByLabel('Cantidad').fill('8');
  await purchaseDialog.getByLabel('Costo unitario').fill('42.25');
  await purchaseDialog
    .getByRole('button', { name: 'Registrar compra' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // 7. Verificar que la compra aparece en la bitácora con la cantidad y el
  // costo correctos. Segunda tabla de la página (Bitácora de compras).
  const purchaseTable = page.locator('table').nth(1);
  const purchaseRow = purchaseTable.getByRole('row', {
    name: new RegExp(fixtures.productSku),
  });
  await expect(purchaseRow).toBeVisible();
  await expect(purchaseRow).toContainText('8');
  await expect(purchaseRow).toContainText('42,25'); // formato es-CO, coma decimal
});
