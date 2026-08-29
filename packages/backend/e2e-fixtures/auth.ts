// Fixtures del test Playwright de auth (packages/desktop/e2e/auth.spec.ts).
//
// El flujo de recuperación por correo no se puede probar de punta a punta
// leyendo un email real: SMTP_* no está configurado en CI (MailService es
// best-effort a propósito). El código en sí nunca se guarda en claro en
// ningún lado leíble después del hecho -- solo su hash argon2 (ver
// AuthService.forgotPassword). Sortear eso sembrando el hash ANTES de que
// el spec llame al paso 1 real (POST /auth/forgot-password) no sirve: ese
// mismo endpoint genera su propio código aleatorio y SOBREESCRIBE
// passwordResetCodeHash con el suyo (encontrado corriendo esto por primera
// vez contra el backend real -- el fixture pre-sembrado quedaba invalidado
// apenas el spec pedía el código de verdad). En su lugar, `reseed-code` se
// llama DESPUÉS del paso 1 real del spec, jugando el rol de "leer el
// correo que se habría recibido" -- reescribe el hash a un código ya
// conocido por el test, con el mismo HASH_OPTIONS que usa
// AuthService.resetPasswordWithCode para verificarlo.
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as fs from 'fs';
import * as path from 'path';
import { HASH_OPTIONS } from '../src/auth/argon2-options';

const prisma = new PrismaClient();
const STATE_FILE = path.join(__dirname, '.state-auth.json');
const EMAIL_PREFIX = 'e2e-playwright-auth-';
const RESET_CODE = '654321';
const NEW_PASSWORD = 'Test-password-999!';

interface FixtureState {
  loginEmail: string;
  loginPassword: string;
  resetEmail: string;
  resetCode: string;
  newPassword: string;
}

function loadState(): FixtureState {
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as FixtureState;
}

async function setup() {
  const unique = Date.now();
  const role = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN' },
  });

  const loginEmail = `${EMAIL_PREFIX}login-${unique}@opera.local`;
  const loginPassword = 'Test-password-123!';
  const loginUser = await prisma.user.create({
    data: {
      email: loginEmail,
      password: await argon2.hash(loginPassword, HASH_OPTIONS),
      name: 'Playwright admin login',
    },
  });
  await prisma.userRole.create({
    data: { userId: loginUser.id, roleId: role.id },
  });

  const resetEmail = `${EMAIL_PREFIX}reset-${unique}@opera.local`;
  await prisma.user.create({
    data: {
      email: resetEmail,
      password: await argon2.hash('Test-password-original!', HASH_OPTIONS),
      name: 'Playwright usuario reset',
    },
  });

  const state: FixtureState = {
    loginEmail,
    loginPassword,
    resetEmail,
    resetCode: RESET_CODE,
    newPassword: NEW_PASSWORD,
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(JSON.stringify(state));
}

// Llamado por el spec después de POST /auth/forgot-password real (paso 1) --
// ver el comentario de arriba sobre por qué no puede sembrarse antes.
async function reseedCode() {
  const state = loadState();
  await prisma.user.update({
    where: { email: state.resetEmail },
    data: {
      passwordResetCodeHash: await argon2.hash(state.resetCode, HASH_OPTIONS),
      passwordResetExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });
  console.log('reseed complete');
}

async function teardown() {
  if (!fs.existsSync(STATE_FILE)) {
    return;
  }

  const users = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  // Orden FK-safe: auditLog -> userRole -> user. No se toca el rol ADMIN
  // (compartido/sembrado vía upsert, del que dependen otros fixtures).
  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  fs.unlinkSync(STATE_FILE);
  console.log('teardown complete');
}

const mode = process.argv[2];
const modes: Record<string, () => Promise<void>> = {
  setup,
  'reseed-code': reseedCode,
  teardown,
};
(modes[mode] ?? teardown)()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
