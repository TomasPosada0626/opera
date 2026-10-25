// Fixtures del test Playwright de auth (packages/desktop/e2e/auth.spec.ts).
//
// CI no tiene SMTP, igual que la app de escritorio, así que el spec recorre
// la recuperación con código de recuperación offline. El código nunca se
// guarda en claro (solo su hash argon2, ver AuthService.issueRecoveryCode):
// el fixture siembra el hash de uno conocido por el spec, con el mismo
// HASH_OPTIONS y la misma normalización que usa
// AuthService.resetPasswordWithRecoveryCode para verificarlo. El flujo por
// correo queda cubierto por test/auth.e2e-spec.ts.
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as fs from 'fs';
import * as path from 'path';
import { HASH_OPTIONS } from '../src/auth/argon2-options';
import { normalizeRecoveryCode } from '../src/auth/recovery-code.util';

const prisma = new PrismaClient();
const STATE_FILE = path.join(__dirname, '.state-auth.json');
const EMAIL_PREFIX = 'e2e-playwright-auth-';
const NEW_PASSWORD = 'Test-password-999!';
// Código de recuperación conocido por el spec: la app de escritorio no
// tiene SMTP (tampoco CI), así que la recuperación real que se prueba de
// punta a punta es con este código, no por correo.
const RECOVERY_CODE = '7K2M-QX9D-4HPA-T3VR';

interface FixtureState {
  loginEmail: string;
  loginPassword: string;
  resetEmail: string;
  recoveryCode: string;
  newPassword: string;
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
  const resetUser = await prisma.user.create({
    data: {
      email: resetEmail,
      password: await argon2.hash('Test-password-original!', HASH_OPTIONS),
      name: 'Playwright usuario reset',
    },
  });
  await prisma.passwordRecovery.create({
    data: {
      userId: resetUser.id,
      recoveryCodeHash: await argon2.hash(
        normalizeRecoveryCode(RECOVERY_CODE),
        HASH_OPTIONS,
      ),
      recoveryCodeCreatedAt: new Date(),
    },
  });

  const state: FixtureState = {
    loginEmail,
    loginPassword,
    resetEmail,
    recoveryCode: RECOVERY_CODE,
    newPassword: NEW_PASSWORD,
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(JSON.stringify(state));
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
  teardown,
};
(modes[mode] ?? teardown)()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
