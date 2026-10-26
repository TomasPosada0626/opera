import { execSync } from 'node:child_process';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const BACKEND_DIR = path.resolve(__dirname, '../../backend');

// Requiere el backend real corriendo en localhost:3000 contra Postgres real,
// mismo criterio que el resto de specs (ver users.spec.ts). Cubre login
// (éxito + credenciales inválidas) y el flujo completo de "olvidé mi
// contraseña" contra los endpoints reales — la funcionalidad de seguridad
// más nueva del sistema, hasta ahora sin ninguna cobertura end-to-end real
// (señalado en la auditoría 2026-08-28, hallazgo #9). CI no tiene SMTP,
// igual que la app de escritorio, así que la pantalla ofrece directo el
// código de recuperación offline: el fixture siembra uno conocido y el
// spec recorre esa vía real (desde la ronda 6). El flujo por correo sigue
// cubierto por test/auth.e2e-spec.ts del backend.
interface FixtureState {
  loginEmail: string;
  loginPassword: string;
  resetEmail: string;
  recoveryCode: string;
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
    'Usuario o contraseña incorrectos.',
  );
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /^Buen[oa]s (días|tardes|noches)$/,
    }),
  ).not.toBeVisible();

  // Credenciales reales -- login de verdad, no un token inyectado.
  await page.getByLabel('Contraseña').fill(fixtures.loginPassword);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /^Buen[oa]s (días|tardes|noches)$/,
    }),
  ).toBeVisible();
});

test('recupera la contraseña con el código de recuperación y rota el código', async ({
  page,
}) => {
  await page.goto('/#/login');
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page).toHaveURL(/\/#\/olvide-contrasena/);

  // Sin SMTP (igual que la app de escritorio), la pantalla va directo al
  // código de recuperación — no ofrece un correo que nunca va a llegar.
  await expect(page.getByRole('button', { name: 'Enviar código' })).toHaveCount(
    0,
  );

  // Código equivocado -- el backend real lo rechaza.
  await page.getByLabel('Correo').fill(fixtures.resetEmail);
  await page.getByLabel('Código de recuperación').fill('AAAA-AAAA-AAAA-AAAA');
  await page.getByLabel('Nueva contraseña').fill(fixtures.newPassword);
  await page.getByLabel('Confirmar contraseña').fill(fixtures.newPassword);
  await page.getByRole('button', { name: 'Restablecer contraseña' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'El correo o el código de recuperación no coinciden',
  );

  // Código real, escrito como lo copiaría alguien de un papel (minúsculas,
  // espacios) -- el backend lo normaliza y lo acepta.
  const typed = fixtures.recoveryCode.toLowerCase().replace(/-/g, ' ');
  await page.getByLabel('Código de recuperación').fill(typed);
  await expect(page.getByLabel('Código de recuperación')).toHaveValue(typed);
  await page.getByRole('button', { name: 'Restablecer contraseña' }).click();
  await expect(page.getByText('Contraseña actualizada.')).toBeVisible();

  // El código usado se consumió: la pantalla muestra uno nuevo.
  const newCode = await page.getByTestId('recovery-code').textContent();
  expect(newCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
  expect(newCode).not.toBe(fixtures.recoveryCode);

  // Cierra el loop: inicia sesión con la contraseña nueva, prueba de que el
  // cambio quedó persistido de verdad, no solo en el estado de la UI.
  await page.getByRole('button', { name: 'Ir a iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/#\/login/);
  await page.getByLabel('Correo').fill(fixtures.resetEmail);
  await page.getByLabel('Contraseña').fill(fixtures.newPassword);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /^Buen[oa]s (días|tardes|noches)$/,
    }),
  ).toBeVisible();
});
