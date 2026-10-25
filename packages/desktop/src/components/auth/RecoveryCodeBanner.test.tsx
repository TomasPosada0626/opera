import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { RecoveryCodeBanner } from './RecoveryCodeBanner';
import { apiFetch } from '../../lib/api-client';

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

const BANNER_TEXT = 'Tu cuenta no tiene código de recuperación.';

describe('RecoveryCodeBanner', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('stays hidden when the account already has a recovery code', async () => {
    mockedApiFetch.mockResolvedValue({
      hasRecoveryCode: true,
      createdAt: '2026-10-20T15:00:00.000Z',
    });
    renderWithClient(<RecoveryCodeBanner />);

    await vi.waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
  });

  it('warns when the account has no recovery code and can be dismissed', async () => {
    mockedApiFetch.mockResolvedValue({
      hasRecoveryCode: false,
      createdAt: null,
    });
    const user = userEvent.setup();
    renderWithClient(<RecoveryCodeBanner />);

    expect(await screen.findByText(BANNER_TEXT)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ocultar aviso' }));
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
  });

  it('opens the modal and keeps it open after the code is generated', async () => {
    mockedApiFetch.mockImplementation(
      (_path: string, init?: { method?: string }) =>
        init?.method === 'POST'
          ? Promise.resolve({ recoveryCode: 'AAAA-BBBB-CCCC-DDDD' })
          : Promise.resolve({ hasRecoveryCode: false, createdAt: null }),
    );
    const user = userEvent.setup();
    renderWithClient(<RecoveryCodeBanner />);

    await user.click(
      await screen.findByRole('button', { name: 'Generar ahora' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Código de recuperación' }),
    ).toBeInTheDocument();

    // Al generar, el estado pasa a "tiene código" y el aviso desaparece,
    // pero el modal con el código recién mostrado no debe cerrarse solo.
    mockedApiFetch.mockImplementation(
      (_path: string, init?: { method?: string }) =>
        init?.method === 'POST'
          ? Promise.resolve({ recoveryCode: 'AAAA-BBBB-CCCC-DDDD' })
          : Promise.resolve({
              hasRecoveryCode: true,
              createdAt: '2026-10-25T15:00:00.000Z',
            }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Generar código' }),
    );

    expect(await screen.findByTestId('recovery-code')).toHaveTextContent(
      'AAAA-BBBB-CCCC-DDDD',
    );
    await vi.waitFor(() =>
      expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('recovery-code')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ya lo anoté' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
