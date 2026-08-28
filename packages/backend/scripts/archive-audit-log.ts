// Archivado manual de AuditLog (ver ADR 0006) — nunca corre solo, nadie lo
// llama desde el backend en ejecución. Exporta a un .jsonl antes de borrar
// (nada se pierde) y por defecto es dry-run: sin --confirm, solo cuenta y
// exporta, no borra nada de la base.
//
// Uso:
//   pnpm --filter backend archive:audit-log -- --before=2024-01-01
//   pnpm --filter backend archive:audit-log -- --before=2024-01-01 --confirm
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): { before: Date; confirm: boolean } {
  const beforeArg = argv.find((arg) => arg.startsWith('--before='));
  const confirm = argv.includes('--confirm');

  if (!beforeArg) {
    throw new Error(
      'Falta --before=YYYY-MM-DD — fecha de corte, se archiva todo lo anterior a esa fecha.',
    );
  }
  const before = new Date(beforeArg.slice('--before='.length));
  if (Number.isNaN(before.getTime())) {
    throw new Error(`Fecha inválida en --before: "${beforeArg}"`);
  }
  return { before, confirm };
}

async function main() {
  const { before, confirm } = parseArgs(process.argv.slice(2));

  const toArchive = await prisma.auditLog.findMany({
    where: { timestamp: { lt: before } },
    orderBy: { timestamp: 'asc' },
  });

  if (toArchive.length === 0) {
    console.log(
      `No hay filas de AuditLog anteriores a ${before.toISOString()}.`,
    );
    return;
  }

  const outputFile = path.join(
    __dirname,
    `audit-log-archive-${before.toISOString().slice(0, 10)}.jsonl`,
  );
  const lines = toArchive.map((row) => JSON.stringify(row)).join('\n');
  fs.writeFileSync(outputFile, lines + '\n', 'utf8');
  console.log(
    `${toArchive.length} fila(s) exportadas a ${outputFile} (anteriores a ${before.toISOString()}).`,
  );

  if (!confirm) {
    console.log(
      'Dry-run: nada se borró de la base. Volvé a correr con --confirm para borrar las filas ya exportadas.',
    );
    return;
  }

  const { count } = await prisma.auditLog.deleteMany({
    where: { timestamp: { lt: before } },
  });
  console.log(`${count} fila(s) borradas de AuditLog.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
