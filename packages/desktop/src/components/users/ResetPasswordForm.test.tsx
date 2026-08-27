import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ResetPasswordForm } from './ResetPasswordForm';
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

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('requires at least 8 characters', async () => {
    const user = userEvent.setup();
    renderWithClient(<ResetPasswordForm userId="user-1" onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText('Nueva contraseña'), 'short');
    await user.click(
      screen.getByRole('button', { name: 'Resetear contraseña' }),
    );

    expect(await screen.findByText('Mínimo 8 caracteres')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('submits the new password for the given user', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'user-1' });
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(
      <ResetPasswordForm userId="user-1" onSuccess={onSuccess} />,
    );

    await user.type(
      screen.getByLabelText('Nueva contraseña'),
      'un-password-largo',
    );
    await user.click(
      screen.getByRole('button', { name: 'Resetear contraseña' }),
    );

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/users/user-1/reset-password',
      {
        method: 'PATCH',
        body: JSON.stringify({ newPassword: 'un-password-largo' }),
      },
    );
  });

  it('shows the backend error message when the reset fails', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(403, 'No autorizado para resetear esta contraseña'),
    );
    const user = userEvent.setup();
    renderWithClient(<ResetPasswordForm userId="user-1" onSuccess={vi.fn()} />);

    await user.type(
      screen.getByLabelText('Nueva contraseña'),
      'un-password-largo',
    );
    await user.click(
      screen.getByRole('button', { name: 'Resetear contraseña' }),
    );

    expect(
      await screen.findByText('No autorizado para resetear esta contraseña'),
    ).toBeInTheDocument();
  });

  it('shows a generic error message for a non-API failure', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWithClient(<ResetPasswordForm userId="user-1" onSuccess={vi.fn()} />);

    await user.type(
      screen.getByLabelText('Nueva contraseña'),
      'un-password-largo',
    );
    await user.click(
      screen.getByRole('button', { name: 'Resetear contraseña' }),
    );

    expect(
      await screen.findByText(
        'No se pudo resetear la contraseña. Intenta de nuevo.',
      ),
    ).toBeInTheDocument();
  });
});
