import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { UserRowActions } from './UserRowActions';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { User } from '../../types/user';

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

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'admin@opera.local',
    name: 'Administradora',
    isActive: true,
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
    roles: [{ role: { id: 'role-1', name: 'ADMIN' } }],
    ...overrides,
  };
}

describe('UserRowActions', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('calls onEdit when "Editar" is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderWithClient(
      <UserRowActions
        user={buildUser()}
        isSelf={false}
        onEdit={onEdit}
        onResetPassword={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(onEdit).toHaveBeenCalledWith(buildUser());
  });

  it('calls onResetPassword when "Resetear contraseña" is clicked', async () => {
    const user = userEvent.setup();
    const onResetPassword = vi.fn();
    renderWithClient(
      <UserRowActions
        user={buildUser()}
        isSelf={false}
        onEdit={vi.fn()}
        onResetPassword={onResetPassword}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Resetear contraseña' }),
    );

    expect(onResetPassword).toHaveBeenCalledWith(buildUser());
  });

  it('hides the "Desactivar" button for the current user, even if active', () => {
    renderWithClient(
      <UserRowActions
        user={buildUser()}
        isSelf={true}
        onEdit={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Desactivar' }),
    ).not.toBeInTheDocument();
  });

  it('hides the "Desactivar" button when the user is already inactive', () => {
    renderWithClient(
      <UserRowActions
        user={buildUser({ isActive: false })}
        isSelf={false}
        onEdit={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Desactivar' }),
    ).not.toBeInTheDocument();
  });

  it('calls PATCH /users/:id/deactivate when "Desactivar" is clicked', async () => {
    mockedApiFetch.mockResolvedValue(buildUser({ isActive: false }));
    const user = userEvent.setup();
    renderWithClient(
      <UserRowActions
        user={buildUser()}
        isSelf={false}
        onEdit={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/users/user-1/deactivate',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it('shows an inline error when deactivating fails', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(400, 'No puedes desactivar tu propia cuenta'),
    );
    const user = userEvent.setup();
    renderWithClient(
      <UserRowActions
        user={buildUser()}
        isSelf={false}
        onEdit={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('No puedes desactivar tu propia cuenta'),
    ).toBeInTheDocument();
  });

  it('shows a generic error message when the failure is not an ApiError', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWithClient(
      <UserRowActions
        user={buildUser()}
        isSelf={false}
        onEdit={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('No se pudo desactivar el usuario.'),
    ).toBeInTheDocument();
  });

  it('hides "Borrar datos" while the user is still active', () => {
    renderWithClient(
      <UserRowActions
        user={buildUser()}
        isSelf={false}
        onEdit={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Borrar datos' }),
    ).not.toBeInTheDocument();
  });

  it('hides "Borrar datos" for the current user, even if inactive', () => {
    renderWithClient(
      <UserRowActions
        user={buildUser({ isActive: false })}
        isSelf={true}
        onEdit={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Borrar datos' }),
    ).not.toBeInTheDocument();
  });

  it('opens a confirmation dialog instead of calling the API directly when "Borrar datos" is clicked', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <UserRowActions
        user={buildUser({ isActive: false })}
        isSelf={false}
        onEdit={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Borrar datos' }));

    expect(
      screen.getByRole('dialog', { name: 'Borrar datos personales' }),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('calls PATCH /users/:id/anonymize only after confirming', async () => {
    mockedApiFetch.mockResolvedValue(
      buildUser({ isActive: false, name: 'Usuario eliminado' }),
    );
    const user = userEvent.setup();
    renderWithClient(
      <UserRowActions
        user={buildUser({ isActive: false })}
        isSelf={false}
        onEdit={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Borrar datos' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Eliminar',
      }),
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/users/user-1/anonymize',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('shows an inline error inside the dialog when anonymizing fails, without closing it', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(404, 'Usuario no encontrado'),
    );
    const user = userEvent.setup();
    renderWithClient(
      <UserRowActions
        user={buildUser({ isActive: false })}
        isSelf={false}
        onEdit={vi.fn()}
        onResetPassword={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Borrar datos' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Eliminar',
      }),
    );

    expect(
      await screen.findByText('Usuario no encontrado'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
