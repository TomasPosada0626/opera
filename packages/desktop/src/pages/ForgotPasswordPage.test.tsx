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

// Con SMTP configurado la pantalla ofrece el correo; se espera a que
// cargue /auth/recovery-options antes de interactuar.
async function renderEmailMode() {
  renderWithRouter(<ForgotPasswordPage />);
  await screen.findByRole('button', { name: 'Enviar código' });
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
    mockedApiFetch.mockImplementation((path: string) =>
      path === '/auth/recovery-options'
        ? Promise.resolve({ email: true, recoveryCode: true })
        : Promise.reject(new Error(`Unexpected: ${path}`)),
    );
    navigateMock.mockReset();
    mockedUseNavigate.mockReturnValue(navigateMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a client-side validation error without calling the API', async () => {
    const user = userEvent.setup();
    await renderEmailMode();

    await user.click(screen.getByRole('button', { name: 'Enviar código' }));

    expect(await screen.findByText('Ingresa tu correo')).toBeInTheDocument();
    // Solo la consulta de opciones de recuperación.
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('shows a generic error when requesting the code fails (step 1)', async () => {
    const user = userEvent.setup();
    await renderEmailMode();
    mockedApiFetch.mockRejectedValueOnce(new Error('network down'));

    await user.type(screen.getByLabelText('Correo'), 'admin@opera.local');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));

    expect(
      await screen.findByText(
        'No se pudo procesar la solicitud. Intenta de nuevo.',
      ),
    ).toBeInTheDocument();
    // Sigue en el paso 1 — un fallo al pedir el código no debe avanzar al
    // paso de verificación.
    expect(screen.queryByLabelText('Código')).not.toBeInTheDocument();
  });

  it('requests a code and moves to the verify step on success', async () => {
    const user = userEvent.setup();
    await renderEmailMode();

    await goToVerifyStep(user);

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@opera.local' }),
    });
    expect(screen.getByText(/admin@opera.local/)).toBeInTheDocument();
  });

  it('validates that the code is 6 digits and passwords match before calling the API', async () => {
    const user = userEvent.setup();
    await renderEmailMode();
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
    await renderEmailMode();
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

  it('shows a generic error when the reset failure is not an ApiError', async () => {
    const user = userEvent.setup();
    await renderEmailMode();
    await goToVerifyStep(user);
    mockedApiFetch.mockRejectedValueOnce(new Error('network down'));

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
      await screen.findByText('No se pudo actualizar la contraseña.'),
    ).toBeInTheDocument();
  });

  it('shows an error message when the code is invalid or expired', async () => {
    const { ApiError } = await import('../lib/api-client');
    const user = userEvent.setup();
    await renderEmailMode();
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
  describe('con código de recuperación', () => {
    function mockOptions(email: boolean) {
      mockedApiFetch.mockImplementation((path: string) =>
        path === '/auth/recovery-options'
          ? Promise.resolve({ email, recoveryCode: true })
          : Promise.reject(new Error(`Unexpected: ${path}`)),
      );
    }

    async function fillRecoveryForm(
      user: ReturnType<typeof userEvent.setup>,
      code = '7k2m qx9d 4hpa t3vr',
    ) {
      await user.type(screen.getByLabelText('Correo'), 'admin@opera.local');
      await user.type(screen.getByLabelText('Código de recuperación'), code);
      await user.type(screen.getByLabelText('Nueva contraseña'), 'password123');
      await user.type(
        screen.getByLabelText('Confirmar contraseña'),
        'password123',
      );
    }

    it('goes straight to the recovery code when email is not configured', async () => {
      mockOptions(false);
      renderWithRouter(<ForgotPasswordPage />);

      expect(
        await screen.findByLabelText('Código de recuperación'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Enviar código' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('group', { name: 'Forma de recuperación' }),
      ).not.toBeInTheDocument();
    });

    it('validates the code length before calling the API', async () => {
      mockOptions(false);
      const user = userEvent.setup();
      renderWithRouter(<ForgotPasswordPage />);
      await screen.findByLabelText('Código de recuperación');

      await fillRecoveryForm(user, 'ABC');
      await user.click(
        screen.getByRole('button', { name: /Restablecer contraseña/ }),
      );

      expect(
        await screen.findByText(/El código tiene 16 caracteres/),
      ).toBeInTheDocument();
      expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    });

    it('resets the password and shows the new recovery code to write down', async () => {
      mockOptions(false);
      const user = userEvent.setup();
      renderWithRouter(<ForgotPasswordPage />);
      await screen.findByLabelText('Código de recuperación');
      mockedApiFetch.mockResolvedValueOnce({
        recoveryCode: 'NEW1-NEW2-NEW3-NEW4',
      });

      await fillRecoveryForm(user);
      await user.click(
        screen.getByRole('button', { name: /Restablecer contraseña/ }),
      );

      expect(
        await screen.findByText('NEW1-NEW2-NEW3-NEW4'),
      ).toBeInTheDocument();
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/auth/reset-password-with-recovery-code',
        {
          method: 'POST',
          body: JSON.stringify({
            email: 'admin@opera.local',
            recoveryCode: '7k2m qx9d 4hpa t3vr',
            newPassword: 'password123',
          }),
        },
      );
      await user.click(
        screen.getByRole('button', { name: 'Ir a iniciar sesión' }),
      );
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    });

    it('shows the backend message for a wrong code, and a generic one otherwise', async () => {
      const { ApiError } = await import('../lib/api-client');
      mockOptions(false);
      const user = userEvent.setup();
      renderWithRouter(<ForgotPasswordPage />);
      await screen.findByLabelText('Código de recuperación');
      mockedApiFetch.mockRejectedValueOnce(
        new ApiError(400, 'El correo o el código de recuperación no coinciden'),
      );

      await fillRecoveryForm(user);
      await user.click(
        screen.getByRole('button', { name: /Restablecer contraseña/ }),
      );
      expect(
        await screen.findByText(
          'El correo o el código de recuperación no coinciden',
        ),
      ).toBeInTheDocument();

      mockedApiFetch.mockRejectedValueOnce(new Error('network down'));
      await user.click(
        screen.getByRole('button', { name: /Restablecer contraseña/ }),
      );
      expect(
        await screen.findByText('No se pudo actualizar la contraseña.'),
      ).toBeInTheDocument();
    });

    it('lets the user switch between email and recovery code when both exist', async () => {
      const user = userEvent.setup();
      await renderEmailMode();

      await user.click(screen.getByRole('button', { name: /Con código/ }));
      expect(
        screen.getByLabelText('Código de recuperación'),
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Por correo/ }));
      expect(
        screen.getByRole('button', { name: 'Enviar código' }),
      ).toBeInTheDocument();
    });
  });
});
