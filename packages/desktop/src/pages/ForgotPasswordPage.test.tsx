import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import ForgotPasswordPage from './ForgotPasswordPage';
import { apiFetch } from '../lib/api-client';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: vi.fn() };
});

const mockedApiFetch = apiFetch as unknown as Mock;
const mockedUseNavigate = useNavigate as unknown as Mock;

function renderWithRouter(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

async function goToVerifyStep(user: ReturnType<typeof userEvent.setup>) {
  mockedApiFetch.mockResolvedValueOnce({
    message: 'Si el correo existe, se envió un código de verificación.',
  });
  await user.type(screen.getByLabelText('Correo'), 'admin@opera.local');
  await user.click(screen.getByRole('button', { name: 'Enviar código' }));
  await screen.findByLabelText('Código');
}

describe('ForgotPasswordPage', () => {
  const navigateMock = vi.fn();

  beforeEach(() => {
    mockedApiFetch.mockReset();
    navigateMock.mockReset();
    mockedUseNavigate.mockReturnValue(navigateMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a client-side validation error without calling the API', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ForgotPasswordPage />);

    await user.click(screen.getByRole('button', { name: 'Enviar código' }));

    expect(await screen.findByText('Ingresa tu correo')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('requests a code and moves to the verify step on success', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ForgotPasswordPage />);

    await goToVerifyStep(user);

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@opera.local' }),
    });
    expect(screen.getByText(/admin@opera.local/)).toBeInTheDocument();
  });

  it('validates that the code is 6 digits and passwords match before calling the API', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ForgotPasswordPage />);
    await goToVerifyStep(user);
    mockedApiFetch.mockClear();

    await user.type(screen.getByLabelText('Código'), '123');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'password123');
    await user.type(
      screen.getByLabelText('Confirmar contraseña'),
      'different-password',
    );
    await user.click(
      screen.getByRole('button', { name: 'Actualizar contraseña' }),
    );

    expect(
      await screen.findByText('El código tiene 6 dígitos'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Las contraseñas no coinciden'),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('resets the password with a valid code and shows the confirmation step', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ForgotPasswordPage />);
    await goToVerifyStep(user);
    mockedApiFetch.mockResolvedValueOnce({
      message: 'Contraseña actualizada.',
    });

    await user.type(screen.getByLabelText('Código'), '123456');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'password123');
    await user.type(
      screen.getByLabelText('Confirmar contraseña'),
      'password123',
    );
    await user.click(
      screen.getByRole('button', { name: 'Actualizar contraseña' }),
    );

    expect(
      await screen.findByText('Contraseña actualizada.'),
    ).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: 'admin@opera.local',
        code: '123456',
        newPassword: 'password123',
      }),
    });

    await user.click(
      screen.getByRole('button', { name: 'Ir a iniciar sesión' }),
    );
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('shows an error message when the code is invalid or expired', async () => {
    const { ApiError } = await import('../lib/api-client');
    const user = userEvent.setup();
    renderWithRouter(<ForgotPasswordPage />);
    await goToVerifyStep(user);
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(400, 'Código inválido o expirado'),
    );

    await user.type(screen.getByLabelText('Código'), '000000');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'password123');
    await user.type(
      screen.getByLabelText('Confirmar contraseña'),
      'password123',
    );
    await user.click(
      screen.getByRole('button', { name: 'Actualizar contraseña' }),
    );

    expect(
      await screen.findByText('Código inválido o expirado'),
    ).toBeInTheDocument();
  });
});
