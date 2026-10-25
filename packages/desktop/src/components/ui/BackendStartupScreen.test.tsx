import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendStartupScreen } from './BackendStartupScreen';
import { startupStep } from '../../lib/startup-step';

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
      getBackupStatus: vi.fn(),
      listBackups: vi.fn(),
      restoreBackup: vi.fn(),
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

  it('marks the current startup step and the ones already done', () => {
    render(
      <BackendStartupScreen
        status={{
          state: 'starting',
          message: 'Preparando la base de datos…',
        }}
      />,
    );

    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps[2]).toHaveAttribute('aria-current', 'step');
    expect(steps[2]).toHaveTextContent('Preparando los datos');
    expect(steps[0]).not.toHaveAttribute('aria-current');
  });

  it('hides the step list for messages outside the normal startup (restore)', () => {
    render(
      <BackendStartupScreen
        status={{ state: 'starting', message: 'Restaurando respaldo…' }}
      />,
    );

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText('Restaurando respaldo…')).toBeInTheDocument();
  });

  describe('exporting the error log from the error screen', () => {
    const originalAppLogs = window.appLogs;

    afterEach(() => {
      window.appLogs = originalAppLogs;
    });

    it('is not offered outside Electron', () => {
      window.appLogs = undefined as unknown as typeof window.appLogs;
      render(<BackendStartupScreen status={{ state: 'error' }} />);

      expect(
        screen.queryByRole('button', { name: /Exportar registro/ }),
      ).not.toBeInTheDocument();
    });

    it('shows where the log was saved', async () => {
      window.appLogs = {
        reportError: vi.fn(),
        export: vi
          .fn()
          .mockResolvedValue({ ok: true, path: 'C:\\Escritorio\\opera.log' }),
      };
      const user = userEvent.setup();
      render(<BackendStartupScreen status={{ state: 'error' }} />);

      await user.click(
        screen.getByRole('button', { name: /Exportar registro de errores/ }),
      );

      expect(
        await screen.findByText(/Guardado en C:\\Escritorio\\opera.log/),
      ).toBeInTheDocument();
    });

    it('says when there is nothing to export yet', async () => {
      window.appLogs = {
        reportError: vi.fn(),
        export: vi.fn().mockResolvedValue({ ok: false, reason: 'no-logs' }),
      };
      const user = userEvent.setup();
      render(<BackendStartupScreen status={{ state: 'error' }} />);

      await user.click(
        screen.getByRole('button', { name: /Exportar registro de errores/ }),
      );

      expect(
        await screen.findByText('Todavía no hay errores registrados.'),
      ).toBeInTheDocument();
    });
  });
});

describe('startupStep', () => {
  it.each([
    [undefined, 0],
    ['Comprobando Docker Desktop…', 0],
    [
      'Iniciando Docker Desktop… La primera vez puede tardar un par de minutos.',
      0,
    ],
    ['Iniciando la base de datos…', 1],
    ['Creando la base de datos… La primera vez descarga unos 150 MB.', 1],
    ['Esperando a que la base de datos esté lista…', 1],
    ['Preparando la base de datos…', 2],
    ['Iniciando Opera…', 3],
    ['Esperando a que Opera esté listo…', 3],
    ['Respaldando el estado actual antes de restaurar…', null],
  ])('%s -> %s', (message, step) => {
    expect(startupStep(message)).toBe(step);
  });
});
