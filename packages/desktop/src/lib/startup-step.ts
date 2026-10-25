// En qué paso va el arranque, deducido del mensaje que manda
// backend-manager.ts (ensureDockerRunning → ensurePostgres → runMigrations
// → startBackendProcess). Un mensaje que no encaja (respaldo previo a una
// restauración, por ejemplo) se muestra sin lista de pasos.
export function startupStep(message: string | undefined): number | null {
  if (!message) {
    return 0;
  }
  if (/docker/i.test(message)) {
    return 0;
  }
  if (/preparando la base/i.test(message)) {
    return 2;
  }
  if (/base de datos/i.test(message)) {
    return 1;
  }
  if (/opera/i.test(message)) {
    return 3;
  }
  return null;
}
