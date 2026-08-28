import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  const originalAppLogs = window.appLogs;

  beforeEach(() => {
    // React re-lanza a consola en dev/test además de componentDidCatch —
    // ruido esperado de este test puntual, no algo a corregir.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    window.appLogs = originalAppLogs;
    vi.restoreAllMocks();
  });

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>Todo bien</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Todo bien')).toBeInTheDocument();
  });

  it('shows a fallback UI instead of a blank screen when a child throws during render', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Algo salió mal')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Recargar' }),
    ).toBeInTheDocument();
  });

  it('reports the caught error to window.appLogs when the Electron bridge is present', () => {
    const reportError = vi.fn().mockResolvedValue(undefined);
    window.appLogs = { reportError, export: vi.fn() };

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'react.componentDidCatch',
        message: 'boom',
      }),
    );
  });

  it('does not throw when reporting outside Electron (no appLogs bridge)', () => {
    // @ts-expect-error -- simula jsdom/navegador suelto sin el bridge.
    window.appLogs = undefined;

    expect(() =>
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByText('Algo salió mal')).toBeInTheDocument();
  });

  it('reloads the window when "Recargar" is clicked', async () => {
    const reloadSpy = vi.fn();
    // jsdom no implementa window.location.reload — se reemplaza el objeto
    // completo para poder espiarlo sin que jsdom lance "Not implemented".
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Recargar' }));

    expect(reloadSpy).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });
});
