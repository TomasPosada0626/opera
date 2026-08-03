import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import ProductionOrdersPage from './ProductionOrdersPage';
import { apiFetch } from '../lib/api-client';
import { clearAuthToken, setAuthToken } from '../lib/auth-token';
import type { PaginatedResult } from '../types/product';
import type { ProductionOrder } from '../types/production';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

// header.payload.signature — solo el payload importa, decodeJwtPayload no
// verifica la firma (ver current-user.ts).
function fakeJwt(roles: string[]): string {
  const payload = {
    sub: 'user-1',
    email: 'admin@opera.local',
    roles,
    permissions: [],
  };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function buildOrder(overrides: Partial<ProductionOrder> = {}): ProductionOrder {
  return {
    id: 'order-1',
    product: { id: 'product-1', sku: 'PT-1', name: 'Silla de madera' },
    warehouse: {
      id: 'warehouse-1',
      name: 'Bodega principal',
      location: null,
      isActive: true,
    },
    quantity: '10.000',
    status: 'PENDIENTE',
    completedAt: null,
    totalCost: null,
    unitCost: null,
    createdAt: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

function ordersResponse(
  data: ProductionOrder[],
): PaginatedResult<ProductionOrder> {
  return {
    data,
    meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
  };
}

describe('ProductionOrdersPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    clearAuthToken();
  });

  it('renders a row per order with its status badge', async () => {
    mockedApiFetch.mockResolvedValue(ordersResponse([buildOrder()]));

    renderWithClient(<ProductionOrdersPage />);

    expect(
      await screen.findByText('PT-1 — Silla de madera'),
    ).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Bodega principal')).toBeInTheDocument();
  });

  it('shows the empty message when there are no orders', async () => {
    mockedApiFetch.mockResolvedValue(ordersResponse([]));

    renderWithClient(<ProductionOrdersPage />);

    expect(
      await screen.findByText('No hay órdenes de producción.'),
    ).toBeInTheDocument();
  });

  it('hides "Nueva orden" and the complete action for a non-ADMIN user', async () => {
    setAuthToken(fakeJwt(['STAFF']));
    mockedApiFetch.mockResolvedValue(ordersResponse([buildOrder()]));

    renderWithClient(<ProductionOrdersPage />);

    await screen.findByText('PT-1 — Silla de madera');
    expect(
      screen.queryByRole('button', { name: 'Nueva orden' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Completar' }),
    ).not.toBeInTheDocument();
  });

  it('shows "Nueva orden" and the complete action for an ADMIN user', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(ordersResponse([buildOrder()]));

    renderWithClient(<ProductionOrdersPage />);

    expect(
      await screen.findByRole('button', { name: 'Nueva orden' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Completar' }),
    ).toBeInTheDocument();
  });

  it('opens the creation modal when "Nueva orden" is clicked', async () => {
    setAuthToken(fakeJwt(['ADMIN']));
    mockedApiFetch.mockResolvedValue(ordersResponse([]));

    renderWithClient(<ProductionOrdersPage />);

    const button = await screen.findByRole('button', { name: 'Nueva orden' });
    button.click();

    expect(
      await screen.findByRole('dialog', { name: 'Nueva orden de producción' }),
    ).toBeInTheDocument();
  });
});
