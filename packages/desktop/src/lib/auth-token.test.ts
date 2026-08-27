import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

describe('auth-token', () => {
  const originalAuthToken = window.authToken;

  afterEach(() => {
    window.authToken = originalAuthToken;
    vi.resetModules();
  });

  describe('without a window.authToken bridge (jsdom, no Electron preload)', () => {
    beforeEach(() => {
      // @ts-expect-error simulating an environment with no preload bridge
      delete window.authToken;
    });

    it('starts with no cached token', async () => {
      const { getAuthToken } = await import('./auth-token');
      expect(getAuthToken()).toBeNull();
    });

    it('caches a token in memory via setAuthToken without touching a bridge', async () => {
      const { getAuthToken, setAuthToken } = await import('./auth-token');
      setAuthToken('jwt-token');
      expect(getAuthToken()).toBe('jwt-token');
    });

    it('clears the cached token via clearAuthToken', async () => {
      const { clearAuthToken, getAuthToken, setAuthToken } =
        await import('./auth-token');
      setAuthToken('jwt-token');
      clearAuthToken();
      expect(getAuthToken()).toBeNull();
    });

    it('resolves initAuthToken without hydrating a token', async () => {
      const { getAuthToken, initAuthToken } = await import('./auth-token');
      await initAuthToken();
      expect(getAuthToken()).toBeNull();
    });
  });

  describe('with a window.authToken bridge (Electron preload)', () => {
    let get: Mock<() => Promise<string | null>>;
    let set: Mock<(token: string) => Promise<void>>;
    let clear: Mock<() => Promise<void>>;

    beforeEach(() => {
      get = vi
        .fn<() => Promise<string | null>>()
        .mockResolvedValue('stored-jwt');
      set = vi
        .fn<(token: string) => Promise<void>>()
        .mockResolvedValue(undefined);
      clear = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      window.authToken = { get, set, clear };
    });

    it('hydrates the cached token from the bridge on initAuthToken', async () => {
      const { getAuthToken, initAuthToken } = await import('./auth-token');

      await initAuthToken();

      expect(getAuthToken()).toBe('stored-jwt');
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('only hydrates once even if initAuthToken is awaited concurrently by multiple loaders', async () => {
      const { initAuthToken } = await import('./auth-token');

      await Promise.all([initAuthToken(), initAuthToken(), initAuthToken()]);

      expect(get).toHaveBeenCalledTimes(1);
    });

    it('caches null when the bridge resolves with no token', async () => {
      get.mockResolvedValue(null);
      const { getAuthToken, initAuthToken } = await import('./auth-token');

      await initAuthToken();

      expect(getAuthToken()).toBeNull();
    });

    it('persists a token to the bridge via setAuthToken', async () => {
      const { getAuthToken, setAuthToken } = await import('./auth-token');

      setAuthToken('new-jwt');

      expect(getAuthToken()).toBe('new-jwt');
      expect(set).toHaveBeenCalledWith('new-jwt');
    });

    it('clears the bridge via clearAuthToken', async () => {
      const { clearAuthToken, getAuthToken, setAuthToken } =
        await import('./auth-token');

      setAuthToken('new-jwt');
      clearAuthToken();

      expect(getAuthToken()).toBeNull();
      expect(clear).toHaveBeenCalledTimes(1);
    });
  });
});
