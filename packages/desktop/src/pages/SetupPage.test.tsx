import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
import SetupPage from './SetupPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, getAuthToken } from '../lib/auth-token';

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

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nombre'), 'Admin Local');
  await user.type(screen.getByLabelText('Correo'), 'admin@opera.local');
  await user.type(screen.getByLabelText('Contraseña'), 'password123');
  await user.type(screen.getByLabelText('Confirmar contraseña'), 'password123');
}

describe('SetupPage', () => {
  const navigateMock = vi.fn();

  beforeEach(() => {
    mockedApiFetch.mockReset();
    navigateMock.mockReset();
    mockedUseNavigate.mockReturnValue(navigateMock);
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('shows client-side validation errors without calling the API', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SetupPage />);

    await user.click(
      screen.getByRole('button', { name: 'Crear cuenta y entrar' }),
    );

    expect(await screen.findByText('Ingresa tu nombre')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu correo')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('rejects mismatched password confirmation without calling the API', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SetupPage />);

    await user.type(screen.getByLabelText('Nombre'), 'Admin Local');
    await user.type(screen.getByLabelText('Correo'), 'admin@opera.local');
    await user.type(screen.getByLabelText('Contraseña'), 'password123');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'otra-cosa');
    await user.click(
      screen.getByRole('button', { name: 'Crear cuenta y entrar' }),
    );

    expect(
      await screen.findByText('Las contraseñas no coinciden'),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('creates the admin account, stores the token, and navigates to the dashboard', async () => {
    mockedApiFetch.mockResolvedValue({ accessToken: 'fake.jwt.token' });
    const user = userEvent.setup();
    renderWithRouter(<SetupPage />);

    await fillValidForm(user);
    await user.click(
      screen.getByRole('button', { name: 'Crear cuenta y entrar' }),
    );

    await waitFor(() => {
      expect(getAuthToken()).toBe('fake.jwt.token');
    });
    expect(mockedApiFetch).toHaveBeenCalledWith('/setup/admin', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Admin Local',
        email: 'admin@opera.local',
        password: 'password123',
      }),
    });
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
  });

  it('shows a specific message on 409 (already configured)', async () => {
    const { ApiError } = await import('../lib/api-client');
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, 'Ya existe un administrador configurado'),
    );
    const user = userEvent.setup();
    renderWithRouter(<SetupPage />);

    await fillValidForm(user);
    await user.click(
      screen.getByRole('button', { name: 'Crear cuenta y entrar' }),
    );

    expect(
      await screen.findByText(
        'Ya existe un administrador configurado en esta instalación.',
      ),
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(getAuthToken()).toBeNull();
  });

  it('shows a generic message on a non-409 failure', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWithRouter(<SetupPage />);

    await fillValidForm(user);
    await user.click(
      screen.getByRole('button', { name: 'Crear cuenta y entrar' }),
    );

    expect(
      await screen.findByText('No se pudo crear la cuenta. Intenta de nuevo.'),
    ).toBeInTheDocument();
  });
});
