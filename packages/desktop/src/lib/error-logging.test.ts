import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { initErrorLogging } from './error-logging';

describe('error-logging', () => {
  const originalAppLogs = window.appLogs;

  afterEach(() => {
    window.appLogs = originalAppLogs;
  });

  it('does nothing outside Electron (no appLogs bridge)', () => {
    // @ts-expect-error -- simula jsdom/navegador suelto sin el bridge.
    window.appLogs = undefined;

    expect(() => initErrorLogging()).not.toThrow();
  });

  describe('with the bridge present', () => {
    let reportError: Mock<
      (entry: {
        type: string;
        message: string;
        stack?: string;
      }) => Promise<void>
    >;

    beforeEach(() => {
      reportError = vi
        .fn<
          (entry: {
            type: string;
            message: string;
            stack?: string;
          }) => Promise<void>
        >()
        .mockResolvedValue(undefined);
      window.appLogs = { reportError, export: vi.fn() };
      initErrorLogging();
    });

    it('reports uncaught errors with their message and stack', () => {
      const error = new Error('boom');
      window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error }));

      expect(reportError).toHaveBeenCalledWith({
        type: 'window.onerror',
        message: 'boom',
        stack: error.stack,
      });
    });

    it('reports unhandled promise rejections', () => {
      const event = new Event('unhandledrejection') as PromiseRejectionEvent & {
        reason: unknown;
      };
      Object.defineProperty(event, 'reason', {
        value: new Error('rejected'),
      });
      window.dispatchEvent(event);

      expect(reportError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'unhandledrejection',
          message: 'rejected',
        }),
      );
    });

    it('stringifies a non-Error rejection reason', () => {
      const event = new Event('unhandledrejection') as PromiseRejectionEvent & {
        reason: unknown;
      };
      Object.defineProperty(event, 'reason', { value: 'plain string reason' });
      window.dispatchEvent(event);

      expect(reportError).toHaveBeenCalledWith({
        type: 'unhandledrejection',
        message: 'plain string reason',
        stack: undefined,
      });
    });
  });
});
