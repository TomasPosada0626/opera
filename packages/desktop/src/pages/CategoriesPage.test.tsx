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
import CategoriesPage from './CategoriesPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import type { Category, PaginatedResult } from '../types/product';

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

function fakeJwt(roles: string[]): string {
  const payload = {
    sub: 'user-1',
    email: 'admin@opera.local',
    roles,
    permissions: [],
  };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function buildCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Muebles de madera',
    isActive: true,
    ...overrides,
  };
}

function categoriesResponse(data: Category[]): PaginatedResult<Category> {
  return {
    data,
    meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
  };
}

describe('CategoriesPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('renders a row per category', async () => {
    mockedApiFetch.mockResolvedValue(categoriesResponse([buildCategory()]));

    renderWithClient(<CategoriesPage />);

    expect(await screen.findByText('Muebles de madera')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
  });

  it('shows the empty message when there are no categories', async () => {
    mockedApiFetch.mockResolvedValue(categoriesResponse([]));

    renderWithClient(<CategoriesPage />);

    expect(
      await screen.findByText('No se encontraron categorías.'),
    ).toBeInTheDocument();
  });

  it('shows an Inactiva badge and hides "Desactivar" for an inactive category', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(
      categoriesResponse([buildCategory({ isActive: false })]),
    );

    renderWithClient(<CategoriesPage />);

    expect(await screen.findByText('Inactiva')).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Editar' });
    expect(
      screen.queryByRole('button', { name: 'Desactivar' }),
    ).not.toBeInTheDocument();
  });

  it('hides "Nueva categoría" and row actions for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockedApiFetch.mockResolvedValue(categoriesResponse([buildCategory()]));

    renderWithClient(<CategoriesPage />);

    await screen.findByText('Muebles de madera');
    expect(
      screen.queryByRole('button', { name: 'Nueva categoría' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument();
  });

  it('opens the creation modal and submits with the right body', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation(
      (_path: string, options?: RequestInit) => {
        if (options?.method === 'POST') return Promise.resolve({ id: 'cat-2' });
        return Promise.resolve(categoriesResponse([]));
      },
    );

    renderWithClient(<CategoriesPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Nueva categoría' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Nueva categoría' }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nombre'), 'Tapicería');
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }));

    await waitFor(() => {
      const postCall = mockedApiFetch.mock.calls.find(
        (call: unknown[]) =>
          (call[1] as RequestInit | undefined)?.method === 'POST',
      ) as [string, RequestInit] | undefined;
      expect(postCall?.[0]).toBe('/categories');
      expect(JSON.parse(postCall?.[1].body as string)).toEqual({
        name: 'Tapicería',
      });
    });
  });

  it('opens the edit modal pre-filled with the selected category', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(categoriesResponse([buildCategory()]));
    const user = userEvent.setup();

    renderWithClient(<CategoriesPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(
      await screen.findByRole('dialog', { name: 'Editar categoría' }),
    ).toBeInTheDocument();
    const nameInput: HTMLInputElement = screen.getByLabelText('Nombre');
    expect(nameInput.value).toBe('Muebles de madera');
  });

  it('sends the debounced search term as a query param', async () => {
    mockedApiFetch.mockResolvedValue(categoriesResponse([]));
    const user = userEvent.setup();

    renderWithClient(<CategoriesPage />);

    await user.type(
      screen.getByPlaceholderText('Buscar por nombre…'),
      'muebles',
    );

    await waitFor(
      () => {
        const matched = mockedApiFetch.mock.calls.some((call: unknown[]) => {
          const path = call[0] as string;
          return (
            path.startsWith('/categories?') && path.includes('search=muebles')
          );
        });
        expect(matched).toBe(true);
      },
      { timeout: 2000 },
    );
  });
});
