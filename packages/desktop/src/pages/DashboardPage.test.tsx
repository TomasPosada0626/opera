import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import DashboardPage from './DashboardPage';
import { apiFetch } from '../lib/api-client';
import type { DashboardSummary } from '../types/dashboard';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
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

function buildSummary(
  overrides: Partial<DashboardSummary> = {},
): DashboardSummary {
  return {
    inventory: {
      totalStockValue: '475',
      lowStockCount: 0,
      lowStockProducts: [],
    },
    production: { PENDIENTE: 1, EN_PROCESO: 2, COMPLETADA: 4 },
    orders: { PENDIENTE: 3, EN_PRODUCCION: 1, EN_ALMACEN: 5, CANCELADO: 0 },
    recentPurchases: [],
    recentSales: [],
    recentActivity: [],
    ...overrides,
  };
}

describe('DashboardPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('renders the KPI tiles from the dashboard summary', async () => {
    mockedApiFetch.mockResolvedValue(buildSummary());

    renderWithClient(<DashboardPage />);

    expect(await screen.findByText('475,00')).toBeInTheDocument();
    // Pedidos pendientes = PENDIENTE (3) + EN_PRODUCCION (1)
    expect(await screen.findByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders recent sales and purchases in their own tables', async () => {
    mockedApiFetch.mockResolvedValue(
      buildSummary({
        recentSales: [
          {
            id: 'order-1',
            customerName: 'Muebles del Valle',
            status: 'PENDIENTE',
            total: '120',
            createdAt: '2026-08-01T00:00:00.000Z',
          },
        ],
        recentPurchases: [
          {
            id: 'purchase-1',
            supplierName: 'Maderas del Sur',
            productName: 'Tabla de pino',
            quantity: '10',
            unitCost: '5',
            purchasedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      }),
    );

    renderWithClient(<DashboardPage />);

    expect(await screen.findByText('Muebles del Valle')).toBeInTheDocument();
    expect(screen.getByText('Maderas del Sur')).toBeInTheDocument();
    expect(screen.getByText('Tabla de pino')).toBeInTheDocument();
  });

  it('shows the low-stock product list only when there are critical products', async () => {
    mockedApiFetch.mockResolvedValue(
      buildSummary({
        inventory: {
          totalStockValue: '0',
          lowStockCount: 1,
          lowStockProducts: [
            {
              id: 'p1',
              sku: 'PT-1',
              name: 'Silla de madera',
              currentStock: '2',
              minStock: '5',
            },
          ],
        },
      }),
    );

    renderWithClient(<DashboardPage />);

    expect(
      await screen.findByText(/PT-1 — Silla de madera/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Productos con stock crítico' }),
    ).toBeInTheDocument();
  });
});
