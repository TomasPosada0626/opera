import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupsModal } from './BackupsModal';

const originalAppBackend = window.appBackend;

function mockAppBackend(overrides: Partial<Window['appBackend']> = {}) {
  window.appBackend = {
    getStatus: vi.fn(),
    onStatusChange: vi.fn(),
    retry: vi.fn(),
    getBackupStatus: vi.fn(),
    listBackups: vi.fn().mockResolvedValue([]),
    restoreBackup: vi.fn(),
    ...overrides,
  };
}

const BACKUPS: BackupFile[] = [
  {
    name: 'opera-2026-10-25T08-00-00Z.sql.gz',
    sizeBytes: 3 * 1024 * 1024,
    createdAt: '2026-10-25T13:00:00.000Z',
  },
  {
    name: 'opera-2026-10-24T08-00-00Z.sql.gz',
    sizeBytes: 200,
    createdAt: '2026-10-24T13:00:00.000Z',
  },
];

async function openRestoreStep(user: ReturnType<typeof userEvent.setup>) {
  const [newest] = await screen.findAllByRole('button', { name: /Restaurar/ });
  await user.click(newest);
  return screen.getByLabelText('Escribe RESTAURAR para confirmar');
}

describe('BackupsModal', () => {
  afterEach(() => {
    window.appBackend = originalAppBackend;
  });

  it('says there are no backups yet when the folder is empty', async () => {
    mockAppBackend();
    render(<BackupsModal onClose={vi.fn()} onRestored={vi.fn()} />);

    expect(screen.getByText('Buscando respaldos…')).toBeInTheDocument();
    expect(
      await screen.findByText('Todavía no hay respaldos.'),
    ).toBeInTheDocument();
  });

  it('lists the backups newest first with their size', async () => {
    mockAppBackend({ listBackups: vi.fn().mockResolvedValue(BACKUPS) });
    render(<BackupsModal onClose={vi.fn()} onRestored={vi.fn()} />);

    expect(await screen.findByText('más reciente')).toBeInTheDocument();
    expect(screen.getByText('3.0 MB')).toBeInTheDocument();
    // Un archivo diminuto nunca se muestra como "0 KB".
    expect(screen.getByText('1 KB')).toBeInTheDocument();
  });

  it('only enables the restore button once RESTAURAR is typed', async () => {
    const restoreBackup = vi.fn().mockResolvedValue({ ok: true });
    mockAppBackend({
      listBackups: vi.fn().mockResolvedValue(BACKUPS),
      restoreBackup,
    });
    const onRestored = vi.fn();
    const user = userEvent.setup();
    render(<BackupsModal onClose={vi.fn()} onRestored={onRestored} />);

    const confirmInput = await openRestoreStep(user);
    const restoreButton = screen.getByRole('button', {
      name: /Restaurar este respaldo/,
    });
    expect(restoreButton).toBeDisabled();

    await user.type(confirmInput, 'restaurar');
    expect(restoreButton).toBeDisabled();

    await user.clear(confirmInput);
    await user.type(confirmInput, 'RESTAURAR');
    await user.click(restoreButton);

    expect(restoreBackup).toHaveBeenCalledWith(BACKUPS[0].name);
    await vi.waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
  });

  it('shows the error and stays open when the restore fails', async () => {
    mockAppBackend({
      listBackups: vi.fn().mockResolvedValue(BACKUPS),
      restoreBackup: vi
        .fn()
        .mockResolvedValue({ ok: false, error: 'psql terminó con código 3' }),
    });
    const onRestored = vi.fn();
    const user = userEvent.setup();
    render(<BackupsModal onClose={vi.fn()} onRestored={onRestored} />);

    await user.type(await openRestoreStep(user), 'RESTAURAR');
    await user.click(
      screen.getByRole('button', { name: /Restaurar este respaldo/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'psql terminó con código 3',
    );
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('goes back to the list and clears the confirmation', async () => {
    mockAppBackend({ listBackups: vi.fn().mockResolvedValue(BACKUPS) });
    const user = userEvent.setup();
    render(<BackupsModal onClose={vi.fn()} onRestored={vi.fn()} />);

    await user.type(await openRestoreStep(user), 'RESTAURAR');
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByRole('dialog', { name: 'Respaldos' })).toBeVisible();

    await openRestoreStep(user);
    expect(
      screen.getByLabelText('Escribe RESTAURAR para confirmar'),
    ).toHaveValue('');
  });

  it('does not let the dialog close while a restore is running', async () => {
    let finish: (result: RestoreResult) => void = () => undefined;
    mockAppBackend({
      listBackups: vi.fn().mockResolvedValue(BACKUPS),
      restoreBackup: vi.fn(
        () =>
          new Promise<RestoreResult>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BackupsModal onClose={onClose} onRestored={vi.fn()} />);

    await user.type(await openRestoreStep(user), 'RESTAURAR');
    await user.click(
      screen.getByRole('button', { name: /Restaurar este respaldo/ }),
    );
    expect(await screen.findByText('Restaurando…')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).not.toHaveBeenCalled();

    finish({ ok: false, error: 'falló' });
    expect(await screen.findByRole('alert')).toHaveTextContent('falló');
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
