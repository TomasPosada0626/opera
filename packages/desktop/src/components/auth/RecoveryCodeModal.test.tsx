import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { RecoveryCodeModal } from './RecoveryCodeModal';
import { apiFetch, ApiError } from '../../lib/api-client';

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

function mockStatus(
  status: { hasRecoveryCode: boolean; createdAt: string | null },
  issue: () => Promise<unknown> = () =>
    Promise.resolve({ recoveryCode: 'AAAA-BBBB-CCCC-DDDD' }),
) {
  mockedApiFetch.mockImplementation(
    (path: string, init?: { method?: string }) => {
      if (path === '/auth/recovery-code' && init?.method === 'POST') {
        return issue();
      }
      if (path === '/auth/recovery-code') {
        return Promise.resolve(status);
      }
      return Promise.reject(new Error(`Unexpected: ${path}`));
    },
  );
}

describe('RecoveryCodeModal', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('offers to generate a code when the account has none', async () => {
    mockStatus({ hasRecoveryCode: false, createdAt: null });
    renderWithClient(<RecoveryCodeModal onClose={vi.fn()} />);

    expect(screen.getByText('Revisando…')).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Tu cuenta todavía no tiene código de recuperación',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generar código' }),
    ).toBeEnabled();
  });

  it('warns that generating a new code replaces the existing one', async () => {
    mockStatus({
      hasRecoveryCode: true,
      createdAt: '2026-10-20T15:00:00.000Z',
    });
    renderWithClient(<RecoveryCodeModal onClose={vi.fn()} />);

    expect(
      await screen.findByText('Tu cuenta ya tiene un código de recuperación'),
    ).toBeInTheDocument();
    expect(screen.getByText(/el anterior deja de servir/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generar uno nuevo' }),
    ).toBeInTheDocument();
  });

  it('shows the new code once and closes with "Ya lo anoté"', async () => {
    mockStatus({ hasRecoveryCode: false, createdAt: null });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<RecoveryCodeModal onClose={onClose} />);

    await user.click(
      await screen.findByRole('button', { name: 'Generar código' }),
    );

    expect(await screen.findByTestId('recovery-code')).toHaveTextContent(
      'AAAA-BBBB-CCCC-DDDD',
    );
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/recovery-code', {
      method: 'POST',
    });
    await user.click(screen.getByRole('button', { name: 'Ya lo anoté' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the error when the code cannot be generated', async () => {
    mockStatus({ hasRecoveryCode: false, createdAt: null }, () =>
      Promise.reject(new Error('network down')),
    );
    const user = userEvent.setup();
    renderWithClient(<RecoveryCodeModal onClose={vi.fn()} />);

    await user.click(
      await screen.findByRole('button', { name: 'Generar código' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo generar el código. Intenta de nuevo.',
    );
  });

  it('shows the backend message when it explains the failure', async () => {
    mockStatus({ hasRecoveryCode: false, createdAt: null }, () =>
      Promise.reject(new ApiError(429, 'Demasiados intentos')),
    );
    const user = userEvent.setup();
    renderWithClient(<RecoveryCodeModal onClose={vi.fn()} />);

    await user.click(
      await screen.findByRole('button', { name: 'Generar código' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos',
    );
  });
});
