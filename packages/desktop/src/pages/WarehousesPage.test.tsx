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
import WarehousesPage from './WarehousesPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import type { PaginatedResult } from '../types/product';
import type { Warehouse } from '../types/inventory';

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

function buildWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return {
    id: 'warehouse-1',
    name: 'Bodega principal',
    location: 'Zona industrial',
    isActive: true,
    ...overrides,
  };
}

function warehousesResponse(data: Warehouse[]): PaginatedResult<Warehouse> {
  return {
    data,
    meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
  };
}

describe('WarehousesPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('renders a row per warehouse', async () => {
    mockedApiFetch.mockResolvedValue(warehousesResponse([buildWarehouse()]));

    renderWithClient(<WarehousesPage />);

    expect(await screen.findByText('Bodega principal')).toBeInTheDocument();
    expect(screen.getByText('Zona industrial')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
  });

  it('shows a dash when location is not set, and the empty message with no rows', async () => {
    mockedApiFetch.mockResolvedValue(
      warehousesResponse([buildWarehouse({ location: null })]),
    );

    renderWithClient(<WarehousesPage />);

    await screen.findByText('Bodega principal');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('hides "Nueva bodega" for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockedApiFetch.mockResolvedValue(warehousesResponse([buildWarehouse()]));

    renderWithClient(<WarehousesPage />);

    await screen.findByText('Bodega principal');
    expect(
      screen.queryByRole('button', { name: 'Nueva bodega' }),
    ).not.toBeInTheDocument();
  });

  it('opens the creation modal and submits with the right body', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation(
      (_path: string, options?: RequestInit) => {
        if (options?.method === 'POST')
          return Promise.resolve({ id: 'warehouse-2' });
        return Promise.resolve(warehousesResponse([]));
      },
    );

    renderWithClient(<WarehousesPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Nueva bodega' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Nueva bodega' }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nombre'), 'Bodega norte');
    await user.click(screen.getByRole('button', { name: 'Crear bodega' }));

    await waitFor(() => {
      const postCall = mockedApiFetch.mock.calls.find(
        (call: unknown[]) =>
          (call[1] as RequestInit | undefined)?.method === 'POST',
      ) as [string, RequestInit] | undefined;
      expect(postCall?.[0]).toBe('/warehouses');
      expect(JSON.parse(postCall?.[1].body as string)).toEqual({
        name: 'Bodega norte',
      });
    });
  });

  it('opens the edit modal pre-filled with the selected warehouse', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(warehousesResponse([buildWarehouse()]));
    const user = userEvent.setup();

    renderWithClient(<WarehousesPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(
      await screen.findByRole('dialog', { name: 'Editar bodega' }),
    ).toBeInTheDocument();
    const nameInput: HTMLInputElement = screen.getByLabelText('Nombre');
    expect(nameInput.value).toBe('Bodega principal');
  });
});
