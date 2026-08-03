import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CompleteOrderAction } from './CompleteOrderAction';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { ProductionOrder } from '../../types/production';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
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

describe('CompleteOrderAction', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('shows a dash instead of a button when the order is already COMPLETADA', () => {
    renderWithClient(
      <CompleteOrderAction order={buildOrder({ status: 'COMPLETADA' })} />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Completar' }),
    ).not.toBeInTheDocument();
  });

  it('calls POST /production-orders/:id/complete when clicked', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'order-1', status: 'COMPLETADA' });
    const user = userEvent.setup();
    renderWithClient(<CompleteOrderAction order={buildOrder()} />);

    await user.click(screen.getByRole('button', { name: 'Completar' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/production-orders/order-1/complete',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('shows an inline error when completing fails', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(
        400,
        'Stock insuficiente de materias primas para completar esta orden',
      ),
    );
    const user = userEvent.setup();
    renderWithClient(<CompleteOrderAction order={buildOrder()} />);

    await user.click(screen.getByRole('button', { name: 'Completar' }));

    expect(
      await screen.findByText(
        'Stock insuficiente de materias primas para completar esta orden',
      ),
    ).toBeInTheDocument();
  });
});
