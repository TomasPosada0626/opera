import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const { backoffDelayMs, withRetry } = createRequire(import.meta.url)(
  './retry.js',
);

describe('backoffDelayMs', () => {
  it('duplica el delay en cada intento (backoff exponencial)', () => {
    expect(backoffDelayMs(1, 1000)).toBe(1000);
    expect(backoffDelayMs(2, 1000)).toBe(2000);
    expect(backoffDelayMs(3, 1000)).toBe(4000);
  });

  it('usa 3000ms como base por defecto', () => {
    expect(backoffDelayMs(1)).toBe(3000);
  });
});

describe('withRetry', () => {
  function instantSleep() {
    return Promise.resolve();
  }

  it('devuelve el resultado sin reintentar si el primer intento funciona', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const onRetry = vi.fn();

    const result = await withRetry(fn, { sleep: instantSleep, onRetry });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('reintenta tras una falla y devuelve el resultado del intento que funciona', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    const result = await withRetry(fn, { sleep: instantSleep, onRetry });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(
      expect.any(Error),
      1,
      expect.any(Number),
    );
  });

  it('lanza el último error si se agotan todos los intentos', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistente'));

    await expect(
      withRetry(fn, { sleep: instantSleep, maxAttempts: 3 }),
    ).rejects.toThrow('persistente');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('espera con backoff exponencial entre reintentos', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockResolvedValue('ok');
    const sleep = vi.fn().mockResolvedValue(undefined);

    await withRetry(fn, { sleep, baseDelayMs: 1000 });

    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000);
  });
});
