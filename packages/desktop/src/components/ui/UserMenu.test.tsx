import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { UserMenu } from './UserMenu';
import { apiFetch } from '../../lib/api-client';
import type { CurrentUser } from '../../lib/current-user';
import { toast } from '../../lib/toast';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function buildUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    sub: 'user-1',
    email: 'admin@opera.local',
    roles: ['ADMIN'],
    permissions: [],
    ...overrides,
  };
}

describe('UserMenu', () => {
  it('renders nothing when there is no user', () => {
    const { container } = render(<UserMenu user={null} onLogout={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the user initials and keeps the menu closed by default', () => {
    render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'AD' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the menu on click, showing the email and roles', async () => {
    const user = userEvent.setup();
    render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'AD' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('admin@opera.local')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });

  it('shows a placeholder when the user has no roles', async () => {
    const user = userEvent.setup();
    render(<UserMenu user={buildUser({ roles: [] })} onLogout={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'AD' }));

    expect(screen.getByText('Sin rol asignado')).toBeInTheDocument();
  });

  it('closes the menu on a second click of the trigger', async () => {
    const user = userEvent.setup();
    render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'AD' });
    await user.click(trigger);
    await user.click(trigger);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on Escape', async () => {
    const user = userEvent.setup();
    render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'AD' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu when clicking outside of it', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <UserMenu user={buildUser()} onLogout={vi.fn()} />
        <button type="button">Fuera</button>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'AD' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fuera' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls onLogout when "Cerrar sesión" is clicked', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(<UserMenu user={buildUser()} onLogout={onLogout} />);

    await user.click(screen.getByRole('button', { name: 'AD' }));
    await user.click(screen.getByRole('menuitem', { name: /Cerrar sesión/ }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('does not show "Exportar registro" outside Electron (no appLogs bridge)', async () => {
    const user = userEvent.setup();
    render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'AD' }));

    expect(
      screen.queryByRole('menuitem', { name: /Exportar registro/ }),
    ).not.toBeInTheDocument();
  });

  describe('with the Electron appLogs bridge', () => {
    const originalAppLogs = window.appLogs;

    afterEach(() => {
      window.appLogs = originalAppLogs;
    });

    it('shows the saved path after a successful export', async () => {
      window.appLogs = {
        reportError: vi.fn(),
        export: vi.fn().mockResolvedValue({
          ok: true,
          path: 'C:\\Users\\admin\\Desktop\\opera-errores.log',
        }),
      };
      const user = userEvent.setup();
      render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: 'AD' }));
      await user.click(
        screen.getByRole('menuitem', { name: /Exportar registro/ }),
      );

      expect(
        await screen.findByText(
          /Guardado en C:\\Users\\admin\\Desktop\\opera-errores.log/,
        ),
      ).toBeInTheDocument();
    });

    it('tells the user when there is nothing to export yet', async () => {
      window.appLogs = {
        reportError: vi.fn(),
        export: vi.fn().mockResolvedValue({ ok: false, reason: 'no-logs' }),
      };
      const user = userEvent.setup();
      render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: 'AD' }));
      await user.click(
        screen.getByRole('menuitem', { name: /Exportar registro/ }),
      );

      expect(
        await screen.findByText('No hay errores registrados todavía.'),
      ).toBeInTheDocument();
    });

    it('says nothing when the user cancels the save dialog', async () => {
      const exportLogs = vi
        .fn()
        .mockResolvedValue({ ok: false, reason: 'canceled' });
      window.appLogs = { reportError: vi.fn(), export: exportLogs };
      const user = userEvent.setup();
      render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: 'AD' }));
      await user.click(
        screen.getByRole('menuitem', { name: /Exportar registro/ }),
      );

      await vi.waitFor(() => expect(exportLogs).toHaveBeenCalled());
      expect(screen.queryByText(/Guardado en/)).not.toBeInTheDocument();
    });
  });

  // Documentación/Observabilidad, auditoría 2026-09-06 (ronda 5): el backup
  // automático fallaba en silencio, sin ningún indicador para quien usa la
  // app.
  describe('con el puente de Electron appBackend (estado del backup)', () => {
    const originalAppBackend = window.appBackend;

    afterEach(() => {
      window.appBackend = originalAppBackend;
    });

    it('muestra cuándo fue el último respaldo exitoso', async () => {
      window.appBackend = {
        getStatus: vi.fn(),
        onStatusChange: vi.fn(),
        retry: vi.fn(),
        listBackups: vi.fn().mockResolvedValue([]),
        restoreBackup: vi.fn(),
        getBackupStatus: vi.fn().mockResolvedValue({
          lastSuccessAt: new Date(
            Date.now() - 2 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          lastAttemptFailed: false,
        }),
      };
      const user = userEvent.setup();
      render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: 'AD' }));

      expect(
        await screen.findByText(/Último respaldo exitoso: hace 2 días/),
      ).toBeInTheDocument();
    });

    it('avisa cuando el último intento de respaldo falló', async () => {
      window.appBackend = {
        getStatus: vi.fn(),
        onStatusChange: vi.fn(),
        retry: vi.fn(),
        listBackups: vi.fn().mockResolvedValue([]),
        restoreBackup: vi.fn(),
        getBackupStatus: vi.fn().mockResolvedValue({
          lastSuccessAt: null,
          lastAttemptFailed: true,
        }),
      };
      const user = userEvent.setup();
      render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: 'AD' }));

      expect(
        await screen.findByText(
          'El último respaldo falló y todavía no hay ninguno exitoso.',
        ),
      ).toBeInTheDocument();
    });

    it('dice que todavía no hubo ningún respaldo si nunca corrió uno', async () => {
      window.appBackend = {
        getStatus: vi.fn(),
        onStatusChange: vi.fn(),
        retry: vi.fn(),
        listBackups: vi.fn().mockResolvedValue([]),
        restoreBackup: vi.fn(),
        getBackupStatus: vi.fn().mockResolvedValue({
          lastSuccessAt: null,
          lastAttemptFailed: false,
        }),
      };
      const user = userEvent.setup();
      render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: 'AD' }));

      expect(
        await screen.findByText(
          'Todavía no se hizo ningún respaldo automático.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('opens the recovery code dialog and keeps it open after the menu closes', async () => {
    mockedApiFetch.mockResolvedValue({
      hasRecoveryCode: false,
      createdAt: null,
    });
    const user = userEvent.setup();
    renderWithClient(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'AD' }));
    await user.click(
      screen.getByRole('menuitem', { name: /Código de recuperación/ }),
    );

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Código de recuperación' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Tu cuenta todavía no tiene código de recuperación',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not offer "Respaldos" outside Electron (no appBackend bridge)', async () => {
    const user = userEvent.setup();
    render(<UserMenu user={buildUser()} onLogout={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'AD' }));

    expect(
      screen.queryByRole('menuitem', { name: /Respaldos/ }),
    ).not.toBeInTheDocument();
  });

  describe('respaldos desde el menú', () => {
    const originalAppBackend = window.appBackend;

    afterEach(() => {
      window.appBackend = originalAppBackend;
      vi.restoreAllMocks();
    });

    it('logs out with a notice after restoring a backup', async () => {
      window.appBackend = {
        getStatus: vi.fn(),
        onStatusChange: vi.fn(),
        retry: vi.fn(),
        getBackupStatus: vi
          .fn()
          .mockResolvedValue({ lastSuccessAt: null, lastAttemptFailed: false }),
        listBackups: vi.fn().mockResolvedValue([
          {
            name: 'opera-2026-10-25T08-00-00Z.sql.gz',
            sizeBytes: 2048,
            createdAt: '2026-10-25T13:00:00.000Z',
          },
        ]),
        restoreBackup: vi.fn().mockResolvedValue({ ok: true }),
      };
      const successToast = vi.spyOn(toast, 'success');
      const onLogout = vi.fn();
      const user = userEvent.setup();
      render(<UserMenu user={buildUser()} onLogout={onLogout} />);

      await user.click(screen.getByRole('button', { name: 'AD' }));
      await user.click(screen.getByRole('menuitem', { name: /Respaldos/ }));
      await user.click(
        await screen.findByRole('button', { name: /^Restaurar$/ }),
      );
      await user.type(
        screen.getByLabelText('Escribe RESTAURAR para confirmar'),
        'RESTAURAR',
      );
      await user.click(
        screen.getByRole('button', { name: /Restaurar este respaldo/ }),
      );

      await vi.waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
      expect(successToast).toHaveBeenCalledWith(
        'Respaldo restaurado. Inicia sesión de nuevo para seguir.',
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes the backups dialog without logging out', async () => {
      window.appBackend = {
        getStatus: vi.fn(),
        onStatusChange: vi.fn(),
        retry: vi.fn(),
        getBackupStatus: vi
          .fn()
          .mockResolvedValue({ lastSuccessAt: null, lastAttemptFailed: false }),
        listBackups: vi.fn().mockResolvedValue([]),
        restoreBackup: vi.fn(),
      };
      const onLogout = vi.fn();
      const user = userEvent.setup();
      render(<UserMenu user={buildUser()} onLogout={onLogout} />);

      await user.click(screen.getByRole('button', { name: 'AD' }));
      await user.click(screen.getByRole('menuitem', { name: /Respaldos/ }));
      await screen.findByText('Todavía no hay respaldos.');
      await user.click(screen.getByRole('button', { name: 'Cerrar' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onLogout).not.toHaveBeenCalled();
    });
  });
});
