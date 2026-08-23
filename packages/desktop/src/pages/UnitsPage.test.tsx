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
import UnitsPage from './UnitsPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import type { PaginatedResult, Unit } from '../types/product';

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

function buildUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'unit-1',
    name: 'Kilogramo',
    abbreviation: 'kg',
    isActive: true,
    ...overrides,
  };
}

function unitsResponse(data: Unit[]): PaginatedResult<Unit> {
  return {
    data,
    meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
  };
}

describe('UnitsPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('renders a row per unit, including its abbreviation', async () => {
    mockedApiFetch.mockResolvedValue(unitsResponse([buildUnit()]));

    renderWithClient(<UnitsPage />);

    expect(await screen.findByText('Kilogramo')).toBeInTheDocument();
    expect(screen.getByText('kg')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
  });

  it('shows the empty message when there are no units', async () => {
    mockedApiFetch.mockResolvedValue(unitsResponse([]));

    renderWithClient(<UnitsPage />);

    expect(
      await screen.findByText('No se encontraron unidades.'),
    ).toBeInTheDocument();
  });

  it('hides "Nueva unidad" for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockedApiFetch.mockResolvedValue(unitsResponse([buildUnit()]));

    renderWithClient(<UnitsPage />);

    await screen.findByText('Kilogramo');
    expect(
      screen.queryByRole('button', { name: 'Nueva unidad' }),
    ).not.toBeInTheDocument();
  });

  it('opens the creation modal and submits with the right body', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation(
      (_path: string, options?: RequestInit) => {
        if (options?.method === 'POST')
          return Promise.resolve({ id: 'unit-2' });
        return Promise.resolve(unitsResponse([]));
      },
    );

    renderWithClient(<UnitsPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Nueva unidad' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Nueva unidad' }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nombre'), 'Litro');
    await user.type(screen.getByLabelText('Abreviación'), 'L');
    await user.click(screen.getByRole('button', { name: 'Crear unidad' }));

    await waitFor(() => {
      const postCall = mockedApiFetch.mock.calls.find(
        (call: unknown[]) =>
          (call[1] as RequestInit | undefined)?.method === 'POST',
      ) as [string, RequestInit] | undefined;
      expect(postCall?.[0]).toBe('/units');
      expect(JSON.parse(postCall?.[1].body as string)).toEqual({
        name: 'Litro',
        abbreviation: 'L',
      });
    });
  });

  it('opens the edit modal pre-filled with the selected unit', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(unitsResponse([buildUnit()]));
    const user = userEvent.setup();

    renderWithClient(<UnitsPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(
      await screen.findByRole('dialog', { name: 'Editar unidad' }),
    ).toBeInTheDocument();
    const abbreviationInput: HTMLInputElement =
      screen.getByLabelText('Abreviación');
    expect(abbreviationInput.value).toBe('kg');
  });
});
