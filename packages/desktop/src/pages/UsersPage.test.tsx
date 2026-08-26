import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import UsersPage from './UsersPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import type { Role } from '../types/role';
import type { User } from '../types/user';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function fakeJwt(sub: string): string {
  const payload = {
    sub,
    email: 'admin@opera.local',
    roles: ['ADMIN'],
    permissions: [],
  };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

const adminRole: Role = { id: 'role-admin', name: 'ADMIN' };

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'ana@opera.local',
    name: 'Ana Admin',
    isActive: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    roles: [{ role: adminRole }],
    ...overrides,
  };
}

function mockEndpoints(users: User[], roles: Role[] = [adminRole]) {
  mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
    if (path === '/users' && (!options || !options.method)) {
      return Promise.resolve(users);
    }
    if (path === '/roles') {
      return Promise.resolve(roles);
    }
    return Promise.reject(new Error(`unexpected call: ${path}`));
  });
}

describe('UsersPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    setAuthToken(fakeJwt('user-1'));
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('renders a row per user with their roles and status', async () => {
    mockEndpoints([
      buildUser(),
      buildUser({
        id: 'user-2',
        name: 'Beto Staff',
        roles: [],
        isActive: false,
      }),
    ]);

    renderWithClient(<UsersPage />);

    expect(await screen.findByText('Ana Admin')).toBeInTheDocument();
    expect(screen.getByText('Beto Staff')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('hides the "Desactivar" action on the row for the logged-in user', async () => {
    mockEndpoints([
      buildUser({ id: 'user-1' }),
      buildUser({ id: 'user-2', name: 'Beto Staff' }),
    ]);

    renderWithClient(<UsersPage />);
    await screen.findByText('Ana Admin');

    const deactivateButtons = screen.getAllByRole('button', {
      name: /Desactivar/,
    });
    expect(deactivateButtons).toHaveLength(1);
  });

  it('creates a user with the selected role', async () => {
    mockEndpoints([]);
    mockedApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/users' && (!options || options.method === undefined)) {
        return Promise.resolve([]);
      }
      if (path === '/roles') {
        return Promise.resolve([adminRole]);
      }
      if (path === '/users' && options?.method === 'POST') {
        return Promise.resolve(buildUser());
      }
      return Promise.reject(new Error(`unexpected call: ${path}`));
    });
    const user = userEvent.setup();

    renderWithClient(<UsersPage />);
    await screen.findByText('No hay usuarios registrados.');

    await user.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    await user.type(screen.getByLabelText('Nombre'), 'Carla Nueva');
    await user.type(screen.getByLabelText('Correo'), 'carla@opera.local');
    await user.type(screen.getByLabelText('Contraseña'), 'clave-larga-123');
    await user.click(await screen.findByRole('checkbox', { name: 'ADMIN' }));
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));

    await waitFor(() => {
      const postCall = mockedApiFetch.mock.calls.find(
        (call: unknown[]) =>
          call[0] === '/users' &&
          (call[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall![1] as RequestInit).body as string) as {
        email: string;
        roleIds: string[];
      };
      expect(body.email).toBe('carla@opera.local');
      expect(body.roleIds).toEqual([adminRole.id]);
    });
  });
});
