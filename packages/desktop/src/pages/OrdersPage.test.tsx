import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
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
import OrdersPage from './OrdersPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import type { PaginatedResult } from '../types/product';
import type { Order } from '../types/order';

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

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    status: 'PENDIENTE',
    customer: {
      id: 'customer-1',
      name: 'Muebles del Valle S.A.S.',
      taxId: null,
      email: null,
      phone: null,
      address: null,
      isActive: true,
    },
    warehouse: {
      id: 'warehouse-1',
      name: 'Bodega principal',
      location: null,
      isActive: true,
    },
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        product: { id: 'product-1', sku: 'PT-1', name: 'Silla de madera' },
        quantity: '3',
        unitPrice: '25',
      },
    ],
    remissions: [],
    createdAt: '2026-01-15T10:00:00.000Z',
    productionStartedAt: null,
    warehousedAt: null,
    ...overrides,
  };
}

function ordersResponse(data: Order[]): PaginatedResult<Order> {
  return {
    data,
    meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
  };
}

describe('OrdersPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('renders a row per order with its computed total', async () => {
    mockedApiFetch.mockResolvedValue(ordersResponse([buildOrder()]));

    renderWithClient(<OrdersPage />);

    expect(
      await screen.findByText('Muebles del Valle S.A.S.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Bodega principal')).toBeInTheDocument();
    // "Pendiente" también es el texto del filtro por estado — se busca solo
    // dentro de la tabla para no ser ambiguo con el pill del filtro.
    expect(
      within(screen.getByRole('table')).getByText('Pendiente'),
    ).toBeInTheDocument();
    // 3 * 25 = 75.00
    expect(screen.getByText('75,00')).toBeInTheDocument();
  });

  it('shows the empty message when there are no orders', async () => {
    mockedApiFetch.mockResolvedValue(ordersResponse([]));

    renderWithClient(<OrdersPage />);

    expect(
      await screen.findByText('No hay pedidos registrados.'),
    ).toBeInTheDocument();
  });

  it('hides "Nuevo pedido" for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockedApiFetch.mockResolvedValue(ordersResponse([buildOrder()]));

    renderWithClient(<OrdersPage />);

    await screen.findByText('Muebles del Valle S.A.S.');
    expect(
      screen.queryByRole('button', { name: 'Nuevo pedido' }),
    ).not.toBeInTheDocument();
  });

  it('opens the creation modal when "Nuevo pedido" is clicked', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(ordersResponse([]));

    renderWithClient(<OrdersPage />);

    const button = await screen.findByRole('button', { name: 'Nuevo pedido' });
    button.click();

    expect(
      await screen.findByRole('dialog', { name: 'Nuevo pedido' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Crear pedido' }),
    ).toBeInTheDocument();
  });

  it('links each row to its detail page', async () => {
    mockedApiFetch.mockResolvedValue(ordersResponse([buildOrder()]));

    renderWithClient(<OrdersPage />);

    const link = await screen.findByRole('link', { name: /Ver detalle/ });
    expect(link).toHaveAttribute('href', '/pedidos/order-1');
  });

  it('refetches with the status query param when a filter pill is clicked', async () => {
    mockedApiFetch.mockResolvedValue(ordersResponse([buildOrder()]));
    const user = userEvent.setup();

    renderWithClient(<OrdersPage />);

    await screen.findByText('Muebles del Valle S.A.S.');
    await user.click(screen.getByRole('button', { name: 'En producción' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=EN_PRODUCCION'),
      ),
    );
  });

  it('shows the "Marcar en producción" row action only for an ADMIN user', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(ordersResponse([buildOrder()]));

    renderWithClient(<OrdersPage />);

    expect(
      await screen.findByRole('button', { name: 'Marcar en producción' }),
    ).toBeInTheDocument();
  });

  it('hides the row status action for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockedApiFetch.mockResolvedValue(ordersResponse([buildOrder()]));

    renderWithClient(<OrdersPage />);

    await screen.findByText('Muebles del Valle S.A.S.');
    expect(
      screen.queryByRole('button', { name: 'Marcar en producción' }),
    ).not.toBeInTheDocument();
  });
});
