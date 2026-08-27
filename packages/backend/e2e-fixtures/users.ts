// Fixtures del test Playwright del módulo de Usuarios
// (packages/desktop/e2e/users.spec.ts). Más simple que el de #57: el
// módulo de Usuarios no depende de catálogo/bodegas, así que el setup
// solo necesita el rol ADMIN y una cuenta que inicie sesión de verdad
// por la UI (el login real lo hace Playwright, igual que en el resto de
// specs — ver e2e-fixtures/production-to-inventory.ts).
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const STATE_FILE = path.join(__dirname, '.state-users.json');

// Prefijo compartido entre el admin de este fixture y el usuario que el
// propio test crea desde la UI (packages/desktop/e2e/users.spec.ts) — el
// segundo usuario no tiene id conocido de antemano por este script, así
// que el teardown los encuentra a ambos por email en vez de por id.
const EMAIL_PREFIX = 'e2e-playwright-users-';

interface FixtureState {
  email: string;
  password: string;
  emailPrefix: string;
}

async function setup() {
  const unique = Date.now();
  const email = `${EMAIL_PREFIX}${unique}@opera.local`;
  const password = 'Test-password-123!';

  const role = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN' },
  });
  const user = await prisma.user.create({
    data: {
      email,
      password: await argon2.hash(password),
      name: 'Playwright admin usuarios',
    },
  });
  await prisma.userRole.create({
    data: { userId: user.id, roleId: role.id },
  });

  const state: FixtureState = { email, password, emailPrefix: EMAIL_PREFIX };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(JSON.stringify(state));
}

async function teardown() {
  if (!fs.existsSync(STATE_FILE)) {
    return;
  }
  const state = JSON.parse(
    fs.readFileSync(STATE_FILE, 'utf-8'),
  ) as FixtureState;

  // Busca por prefijo de email en vez de por id: además del admin creado
  // acá, el test crea un segundo usuario por la UI real (el flujo que
  // este spec ejercita) cuyo id este script nunca conoce. Ambos comparten
  // el mismo prefijo con timestamp, así que basta un solo filtro.
  const users = await prisma.user.findMany({
    where: { email: { startsWith: state.emailPrefix } },
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
(mode === 'setup' ? setup() : teardown())
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
