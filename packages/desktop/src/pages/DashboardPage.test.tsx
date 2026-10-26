import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import DashboardPage from './DashboardPage';
import { apiFetch } from '../lib/api-client';
import { buildDashboardSummary } from '../test/factories';

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

describe('DashboardPage', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('renders the KPI tiles linked to where each number can be investigated', async () => {
    mockedApiFetch.mockResolvedValue(
      buildDashboardSummary({
        receivables: { total: '1250000', remissionCount: 3 },
        overdueOrders: { count: 2, orders: [] },
        orders: {
          PENDIENTE: 3,
          EN_PRODUCCION: 1,
          EN_ALMACEN: 5,
          DESPACHADO: 4,
          CANCELADO: 0,
        },
      }),
    );

    renderWithClient(<DashboardPage />);

    expect(
      await screen.findByText('3 remisiones pendientes'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Por cobrar/ })).toHaveAttribute(
      'href',
      '/reportes?vista=cartera',
    );
    expect(
      screen.getByRole('link', { name: /Pedidos atrasados: 2/ }),
    ).toHaveAttribute('href', '/pedidos?filtro=atrasados');
    // En curso = 3 + 1 + 5.
    expect(
      screen.getByRole('link', { name: /Pedidos en curso: 9/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('5 listos para despachar')).toBeInTheDocument();
  });

  it('shows the pipeline of orders by station', async () => {
    mockedApiFetch.mockResolvedValue(
      buildDashboardSummary({
        orders: {
          PENDIENTE: 1,
          EN_PRODUCCION: 0,
          EN_ALMACEN: 0,
          DESPACHADO: 0,
          CANCELADO: 0,
        },
      }),
    );

    renderWithClient(<DashboardPage />);

    expect(
      await screen.findByText('1 pedido sin despachar'),
    ).toBeInTheDocument();
  });

  it('lists overdue orders with how many days late each one is', async () => {
    mockedApiFetch.mockResolvedValue(
      buildDashboardSummary({
        overdueOrders: {
          count: 1,
          orders: [
            {
              id: 'order-9',
              number: 9,
              customerName: 'Ferretería Sur',
              status: 'EN_PRODUCCION',
              estimatedDeliveryDate: '2020-01-01T00:00:00.000Z',
            },
          ],
        },
      }),
    );

    renderWithClient(<DashboardPage />);

    const link = (await screen.findByText('Ferretería Sur')).closest('a');
    expect(link).toHaveAttribute('href', '/pedidos/order-9');
    expect(screen.getByText(/^\+\d+ d$/)).toBeInTheDocument();
  });

  it('says so when nothing is overdue and stock is fine', async () => {
    mockedApiFetch.mockResolvedValue(buildDashboardSummary());

    renderWithClient(<DashboardPage />);

    expect(
      await screen.findByText('Ningún pedido atrasado.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Todo el stock está sobre el mínimo.'),
    ).toBeInTheDocument();
  });

  it('renders recent sales and purchases in their own tables', async () => {
    mockedApiFetch.mockResolvedValue(
      buildDashboardSummary({
        recentSales: [
          {
            id: 'order-1',
            number: 4,
            customerName: 'Muebles del Valle',
            status: 'PENDIENTE',
            total: '75',
            createdAt: '2026-01-15T10:00:00.000Z',
          },
        ],
        recentPurchases: [
          {
            id: 'purchase-1',
            number: 3,
            supplierName: 'Maderas del Sur',
            status: 'PARCIAL',
            itemCount: 2,
            total: '50',
            purchasedAt: '2026-01-14T10:00:00.000Z',
          },
        ],
      }),
    );

    renderWithClient(<DashboardPage />);

    expect(await screen.findByText('Muebles del Valle')).toBeInTheDocument();
    expect(screen.getByText('Maderas del Sur')).toBeInTheDocument();
    expect(screen.getByText('Llegó una parte')).toBeInTheDocument();
  });

  it('renders recent activity in plain language', async () => {
    mockedApiFetch.mockResolvedValue(
      buildDashboardSummary({
        recentActivity: [
          {
            id: 'audit-1',
            entity: 'Remission',
            entityId: 'remission-1',
            action: 'ADD_PAYMENT',
            userName: 'Admin',
            timestamp: '2026-01-15T10:00:00.000Z',
          },
        ],
      }),
    );

    renderWithClient(<DashboardPage />);

    expect(await screen.findByText(/registró un abono en/)).toBeInTheDocument();
    expect(screen.getByText('remisión')).toBeInTheDocument();
  });

  it('shows the recent-warnings notice only when there are any', async () => {
    mockedApiFetch.mockResolvedValue(
      buildDashboardSummary({ recentWarnings: 3 }),
    );

    renderWithClient(<DashboardPage />);

    expect(
      await screen.findByText(/3 advertencias del sistema/),
    ).toBeInTheDocument();
  });

  it('shows the low-stock product list with its minimum', async () => {
    mockedApiFetch.mockResolvedValue(
      buildDashboardSummary({
        inventory: {
          totalStockValue: '100',
          lowStockCount: 1,
          lowStockProducts: [
            {
              id: 'product-1',
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
    expect(screen.getByText(/2 \/ mín\. 5/)).toBeInTheDocument();
    expect(screen.getByText('1 con stock crítico')).toBeInTheDocument();
  });
});
