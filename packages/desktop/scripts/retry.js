// Extraído para poder testear la lógica de reintento/backoff sin mockear
// `node:https` (mismo criterio que parse-checksums.js) -- `sleep` es
// inyectable para que los tests no tengan que esperar en tiempo real.
function backoffDelayMs(attempt, baseDelayMs = 3000) {
  return baseDelayMs * 2 ** (attempt - 1);
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pensado para la descarga del instalador de Docker Desktop embebido (600+
// MB): más probabilidad real de un corte de red a mitad de camino que la
// mayoría de las dependencias del proyecto, y hasta ahora un solo intento
// fallido tumbaba el build entero sin volver a intentar (auditoría
// 2026-09-05, ronda 4, Observabilidad).
async function withRetry(
  fn,
  { maxAttempts = 4, baseDelayMs = 3000, onRetry, sleep = defaultSleep } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        break;
      }
      const delayMs = backoffDelayMs(attempt, baseDelayMs);
      onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

module.exports = { backoffDelayMs, withRetry };
