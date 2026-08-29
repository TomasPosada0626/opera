import { execSync } from 'node:child_process';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const BACKEND_DIR = path.resolve(__dirname, '../../backend');

// Requiere el backend real corriendo en localhost:3000 contra Postgres real,
// mismo criterio que el resto de specs (ver users.spec.ts). Cubre login
// (éxito + credenciales inválidas) y el flujo completo de "olvidé mi
// contraseña" contra los endpoints reales — la funcionalidad de seguridad
// más nueva del sistema, hasta ahora sin ninguna cobertura end-to-end real
// (señalado en la auditoría 2026-08-28, hallazgo #9). El código de
// verificación en sí no se puede "leer" de un correo real en CI (SMTP no
// está configurado) — después del paso 1 real, `reseed-code` juega el rol
// de "leer el correo" reescribiendo el hash a un código ya conocido por
// el test; ver e2e-fixtures/auth.ts para el detalle de por qué no puede
// sembrarse antes (el propio endpoint real genera y guarda el suyo).
interface FixtureState {
  loginEmail: string;
  loginPassword: string;
  resetEmail: string;
  resetCode: string;
  newPassword: string;
}

let fixtures: FixtureState;

test.beforeAll(() => {
  const output = execSync('pnpm run e2e:fixtures:auth:setup', {
    cwd: BACKEND_DIR,
  }).toString();
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
  execSync('pnpm run e2e:fixtures:auth:teardown', { cwd: BACKEND_DIR });
});

test('rechaza credenciales inválidas y luego inicia sesión con las reales', async ({
  page,
}) => {
  await page.goto('/#/login');

  // Contraseña incorrecta contra un usuario real -- el backend real
  // responde 401, no un mock.
  await page.getByLabel('Correo').fill(fixtures.loginEmail);
  await page.getByLabel('Contraseña').fill('contraseña-equivocada');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Correo o contraseña incorrectos.',
  );
  await expect(
    page.getByRole('heading', { name: 'Dashboard' }),
  ).not.toBeVisible();

  // Credenciales reales -- login de verdad, no un token inyectado.
  await page.getByLabel('Contraseña').fill(fixtures.loginPassword);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('recupera la contraseña con el flujo completo de dos pasos', async ({
  page,
}) => {
  await page.goto('/#/login');
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page).toHaveURL(/\/#\/olvide-contrasena/);

  // Paso 1: pide el código contra el endpoint real. Respuesta siempre
  // genérica (nunca revela si el correo existe) -- ver ForgotPasswordPage.
  // El propio endpoint ya generó y guardó su propio código aleatorio acá
  // -- reseed-code lo reemplaza por uno conocido, jugando el rol de "leer
  // el correo" que en CI no se puede leer de verdad.
  await page.getByLabel('Correo').fill(fixtures.resetEmail);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByLabel('Código')).toBeVisible();
  execSync('pnpm run e2e:fixtures:auth:reseed-code', { cwd: BACKEND_DIR });

  // Paso 2, código equivocado -- el backend real lo rechaza.
  await page.getByLabel('Código').fill('000000');
  await page.getByLabel('Nueva contraseña').fill(fixtures.newPassword);
  await page.getByLabel('Confirmar contraseña').fill(fixtures.newPassword);
  await page.getByRole('button', { name: 'Actualizar contraseña' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Código inválido o expirado',
  );

  // Paso 2, código real (sembrado por el fixture) -- el backend real lo
  // acepta y actualiza la contraseña de verdad. toHaveValue espera a que
  // React Hook Form termine de procesar el nuevo valor antes de enviar --
  // sin esto, el submit puede dispararse contra el valor todavía viejo
  // ("000000") por una carrera fill()/click() (encontrado corriendo esto
  // por primera vez contra el backend real).
  await page.getByLabel('Código').fill(fixtures.resetCode);
  await expect(page.getByLabel('Código')).toHaveValue(fixtures.resetCode);
  await page.getByRole('button', { name: 'Actualizar contraseña' }).click();
  await expect(page.getByText('Contraseña actualizada.')).toBeVisible();

  // Cierra el loop: inicia sesión con la contraseña nueva, prueba de que el
  // cambio quedó persistido de verdad, no solo en el estado de la UI.
  await page.getByRole('button', { name: 'Ir a iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/#\/login/);
  await page.getByLabel('Correo').fill(fixtures.resetEmail);
  await page.getByLabel('Contraseña').fill(fixtures.newPassword);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
