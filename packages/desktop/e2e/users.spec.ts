import { execSync } from 'node:child_process';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const BACKEND_DIR = path.resolve(__dirname, '../../backend');

// Requiere el backend real corriendo en localhost:3000 contra Postgres real
// (VITE_API_URL por defecto, ver lib/api-client.ts) — Vite lo levanta este
// mismo config (playwright.config.ts), pero el backend queda fuera a
// propósito, mismo criterio que production-to-inventory.spec.ts.
interface FixtureState {
  email: string;
  password: string;
  emailPrefix: string;
}

let fixtures: FixtureState;

test.beforeAll(() => {
  const output = execSync('pnpm run e2e:fixtures:users:setup', {
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
  execSync('pnpm run e2e:fixtures:users:teardown', { cwd: BACKEND_DIR });
});

test('crear, resetear contraseña y desactivar un usuario desde la UI real', async ({
  page,
}) => {
  // El nuevo usuario comparte el prefijo con timestamp del admin del
  // fixture, para que el teardown lo encuentre y borre también (ver
  // e2e-fixtures/users.ts).
  const newUserEmail = `${fixtures.emailPrefix}${Date.now()}@opera.local`;

  // 1. Login real por la UI (no un token inyectado).
  await page.goto('/#/login');
  await page.getByLabel('Correo').fill(fixtures.email);
  await page.getByLabel('Contraseña').fill(fixtures.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // 2. Crear un usuario nuevo por el formulario real.
  await page.goto('/#/usuarios');
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  const createDialog = page.getByRole('dialog');
  await createDialog.getByLabel('Nombre').fill('Usuario Playwright');
  await createDialog.getByLabel('Correo').fill(newUserEmail);
  await createDialog.getByLabel('Contraseña').fill('Test-password-456!');
  await createDialog.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // 3. Verificar que aparece en la lista.
  const newUserRow = page.getByRole('row', { name: new RegExp(newUserEmail) });
  await expect(newUserRow).toBeVisible();

  // 4. Resetear su contraseña por el flujo real.
  await newUserRow.getByRole('button', { name: 'Resetear contraseña' }).click();
  const resetDialog = page.getByRole('dialog');
  await resetDialog.getByLabel('Nueva contraseña').fill('Test-password-789!');
  await resetDialog
    .getByRole('button', { name: 'Resetear contraseña' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // 5. Desactivarlo y verificar que la lista lo refleja.
  await newUserRow.getByRole('button', { name: 'Desactivar' }).click();
  await expect(newUserRow.getByText('Inactivo')).toBeVisible();

  // 6. Guarda de seguridad: no se puede desactivar la propia cuenta. El
  // frontend ya oculta el botón para la propia fila (UserRowActions.tsx,
  // "isSelf") — el backend lo bloquea de verdad (UsersService.deactivate),
  // así que acá solo confirmamos que la UI no ofrece ni intenta la acción
  // para el admin logueado.
  const ownRow = page.getByRole('row', { name: new RegExp(fixtures.email) });
  await expect(ownRow.getByRole('button', { name: 'Desactivar' })).toHaveCount(
    0,
  );
});
