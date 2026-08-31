import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendStartupScreen } from './BackendStartupScreen';

describe('BackendStartupScreen', () => {
  const originalAppBackend = window.appBackend;

  afterEach(() => {
    window.appBackend = originalAppBackend;
  });

  it('shows the default starting message and no retry button', () => {
    render(<BackendStartupScreen status={{ state: 'starting' }} />);

    expect(screen.getByText('Iniciando Opera…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a custom in-progress message when given', () => {
    render(
      <BackendStartupScreen
        status={{
          state: 'starting',
          message: 'Levantando la base de datos…',
        }}
      />,
    );

    expect(
      screen.getByText('Levantando la base de datos…'),
    ).toBeInTheDocument();
  });

  it('shows the error message and calls retry on click', async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    window.appBackend = {
      getStatus: vi.fn(),
      onStatusChange: vi.fn(),
      retry,
    };

    render(
      <BackendStartupScreen
        status={{
          state: 'error',
          message: 'Docker Desktop no está corriendo',
        }}
      />,
    );

    expect(
      screen.getByText('Docker Desktop no está corriendo'),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic error message when none is given', () => {
    render(<BackendStartupScreen status={{ state: 'error' }} />);

    expect(screen.getByText('No se pudo iniciar Opera.')).toBeInTheDocument();
  });
});
