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
import LoginPage from './LoginPage';
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

describe('LoginPage', () => {
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
    renderWithRouter(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByText('Ingresa tu correo')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu contraseña')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('logs in, stores the token, and navigates to the dashboard', async () => {
    mockedApiFetch.mockResolvedValue({ accessToken: 'fake.jwt.token' });
    const user = userEvent.setup();
    renderWithRouter(<LoginPage />);

    await user.type(screen.getByLabelText('Correo'), 'admin@opera.local');
    await user.type(screen.getByLabelText('Contraseña'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    await waitFor(() => {
      expect(getAuthToken()).toBe('fake.jwt.token');
    });
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'admin@opera.local',
        password: 'password123',
      }),
    });
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
  });

  it('shows a specific message on 401 (wrong credentials)', async () => {
    const { ApiError } = await import('../lib/api-client');
    mockedApiFetch.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    const user = userEvent.setup();
    renderWithRouter(<LoginPage />);

    await user.type(screen.getByLabelText('Correo'), 'admin@opera.local');
    await user.type(screen.getByLabelText('Contraseña'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(
      await screen.findByText('Correo o contraseña incorrectos.'),
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(getAuthToken()).toBeNull();
  });

  it('shows a generic message on a non-401 failure', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWithRouter(<LoginPage />);

    await user.type(screen.getByLabelText('Correo'), 'admin@opera.local');
    await user.type(screen.getByLabelText('Contraseña'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(
      await screen.findByText('No se pudo iniciar sesión. Intenta de nuevo.'),
    ).toBeInTheDocument();
  });

  it('links to the forgot-password flow', () => {
    renderWithRouter(<LoginPage />);

    const link = screen.getByRole('link', {
      name: '¿Olvidaste tu contraseña?',
    });
    expect(link).toHaveAttribute('href', '/olvide-contrasena');
  });
});
