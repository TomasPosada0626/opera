import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { OrderStatusActions } from './OrderStatusActions';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { Order } from '../../types/order';

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

describe('OrderStatusActions', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('shows "Marcar en producción" for a PENDIENTE order and calls PATCH mark-production', async () => {
    mockedApiFetch.mockResolvedValue(buildOrder({ status: 'EN_PRODUCCION' }));
    const user = userEvent.setup();
    renderWithClient(<OrderStatusActions order={buildOrder()} />);

    await user.click(
      screen.getByRole('button', { name: 'Marcar en producción' }),
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/orders/order-1/mark-production',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it('shows the day counter and "Marcar enviado a almacén" for an EN_PRODUCCION order', () => {
    renderWithClient(
      <OrderStatusActions
        order={buildOrder({
          status: 'EN_PRODUCCION',
          productionStartedAt: new Date(
            Date.now() - 3 * 86_400_000,
          ).toISOString(),
        })}
      />,
    );

    expect(screen.getByText('3 días en producción')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Marcar enviado a almacén' }),
    ).toBeInTheDocument();
  });

  it('calls POST mark-warehoused when clicked', async () => {
    mockedApiFetch.mockResolvedValue(buildOrder({ status: 'EN_ALMACEN' }));
    const user = userEvent.setup();
    renderWithClient(
      <OrderStatusActions
        order={buildOrder({
          status: 'EN_PRODUCCION',
          productionStartedAt: '2026-01-15T10:00:00.000Z',
        })}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Marcar enviado a almacén' }),
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/orders/order-1/mark-warehoused',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('shows "Cancelar pedido" for an EN_ALMACEN order without remissions', () => {
    renderWithClient(
      <OrderStatusActions order={buildOrder({ status: 'EN_ALMACEN' })} />,
    );
    expect(
      screen.getByRole('button', { name: 'Cancelar pedido' }),
    ).toBeInTheDocument();
  });

  it('shows a dash for an EN_ALMACEN order that already has a remission', () => {
    renderWithClient(
      <OrderStatusActions
        order={buildOrder({
          status: 'EN_ALMACEN',
          remissions: [
            {
              id: 'remission-1',
              number: 1,
              createdAt: '2026-01-16T10:00:00.000Z',
              user: { id: 'user-1', name: 'Admin' },
              items: [],
              paymentStatus: 'CARTERA',
              amountPaid: null,
              voidedAt: null,
              voidReason: null,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows a dash for a CANCELADO order', () => {
    renderWithClient(
      <OrderStatusActions order={buildOrder({ status: 'CANCELADO' })} />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('calls PATCH cancel when "Cancelar pedido" is clicked', async () => {
    mockedApiFetch.mockResolvedValue(buildOrder({ status: 'CANCELADO' }));
    const user = userEvent.setup();
    renderWithClient(<OrderStatusActions order={buildOrder()} />);

    await user.click(screen.getByRole('button', { name: 'Cancelar pedido' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/orders/order-1/cancel',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it('shows an inline error when marking production fails', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, 'El pedido cambió de estado, intenta de nuevo'),
    );
    const user = userEvent.setup();
    renderWithClient(<OrderStatusActions order={buildOrder()} />);

    await user.click(
      screen.getByRole('button', { name: 'Marcar en producción' }),
    );

    expect(
      await screen.findByText('El pedido cambió de estado, intenta de nuevo'),
    ).toBeInTheDocument();
  });
});
