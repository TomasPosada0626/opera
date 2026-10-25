import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { OrderStatusActions } from './OrderStatusActions';
import { apiFetch, ApiError } from '../../lib/api-client';
import { buildOrder, buildRemission } from '../../test/factories';

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

describe('OrderStatusActions', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('shows "Marcar en producción" for a PENDIENTE order and calls PATCH mark-production', async () => {
    mockedApiFetch.mockResolvedValue(buildOrder({ status: 'EN_PRODUCCION' }));
    const user = userEvent.setup();
    renderWithClient(<OrderStatusActions order={buildOrder()} />);

    await user.click(
      screen.getByRole('button', { name: /Marcar en producción/ }),
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/orders/order-1/mark-production',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it('shows the time in production and "Marcar enviado a almacén" for an EN_PRODUCCION order', () => {
    renderWithClient(
      <OrderStatusActions
        order={buildOrder({
          status: 'EN_PRODUCCION',
          productionStartedAt: new Date(
            Date.now() - 3 * 86_400_000 - 60_000,
          ).toISOString(),
        })}
      />,
    );

    expect(screen.getByText('3 días en producción')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Marcar enviado a almacén/ }),
    ).toBeInTheDocument();
  });

  it('keeps the row version compact: no timer and no cancel button', () => {
    renderWithClient(
      <OrderStatusActions
        compact
        order={buildOrder({
          status: 'EN_PRODUCCION',
          productionStartedAt: '2026-01-15T10:00:00.000Z',
        })}
      />,
    );

    expect(screen.queryByText(/en producción$/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Cancelar pedido/ }),
    ).not.toBeInTheDocument();
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
      screen.getByRole('button', { name: /Marcar enviado a almacén/ }),
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/orders/order-1/mark-warehoused',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('lists the missing materials when the order cannot reach the warehouse', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(
        400,
        'No hay suficiente materia prima en la bodega para pasar este pedido a almacén',
        [{ componentName: 'Tabla de roble', required: '6', available: '2' }],
      ),
    );
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
      screen.getByRole('button', { name: /Marcar enviado a almacén/ }),
    );

    expect(await screen.findByText('Tabla de roble')).toBeInTheDocument();
    expect(screen.getByText(/necesita 6 · hay 2/)).toBeInTheDocument();
  });

  it('shows "Cancelar pedido" for an EN_ALMACEN order without remissions and calls PATCH cancel', async () => {
    mockedApiFetch.mockResolvedValue(buildOrder({ status: 'CANCELADO' }));
    const user = userEvent.setup();
    renderWithClient(
      <OrderStatusActions order={buildOrder({ status: 'EN_ALMACEN' })} />,
    );

    await user.click(screen.getByRole('button', { name: /Cancelar pedido/ }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/orders/order-1/cancel',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it.each([
    [
      'an EN_ALMACEN order that already has an active remission',
      buildOrder({ status: 'EN_ALMACEN', remissions: [buildRemission()] }),
    ],
    ['a DESPACHADO order', buildOrder({ status: 'DESPACHADO' })],
    ['a CANCELADO order', buildOrder({ status: 'CANCELADO' })],
  ])('offers no action for %s', (_label, order) => {
    renderWithClient(<OrderStatusActions order={order} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an inline error when marking production fails', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, 'El pedido cambió de estado, intenta de nuevo'),
    );
    const user = userEvent.setup();
    renderWithClient(<OrderStatusActions order={buildOrder()} />);

    await user.click(
      screen.getByRole('button', { name: /Marcar en producción/ }),
    );

    expect(
      await screen.findByText('El pedido cambió de estado, intenta de nuevo'),
    ).toBeInTheDocument();
  });
});
