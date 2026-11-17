import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { EditOrderItemsForm } from './EditOrderItemsForm';
import { apiFetch } from '../../lib/api-client';
import { buildOrder, buildRemission } from '../../test/factories';
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

function twoLineOrder(overrides: Partial<Order> = {}): Order {
  return buildOrder({
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        product: { id: 'product-1', sku: 'PT-1', name: 'Silla de madera' },
        quantity: '10',
        unitPrice: '50',
      },
      {
        id: 'item-2',
        productId: 'product-2',
        product: { id: 'product-2', sku: 'PT-2', name: 'Mesa de centro' },
        quantity: '4',
        unitPrice: '200',
      },
    ],
    ...overrides,
  });
}

describe('EditOrderItemsForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('manda la lista completa con la cantidad nueva y sin la línea quitada', async () => {
    mockedApiFetch.mockResolvedValue(twoLineOrder());
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <EditOrderItemsForm order={twoLineOrder()} onSuccess={onSuccess} />,
    );

    const quantity = screen.getByLabelText('Cantidad línea 1');
    await user.clear(quantity);
    await user.type(quantity, '15');
    expect(screen.getByText('+5 extra')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quitar línea 2' }));
    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/orders/order-1/items',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            items: [
              {
                id: 'item-1',
                productId: 'product-1',
                quantity: 15,
                unitPrice: 50,
              },
            ],
          }),
        }),
      ),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('con despachos fija el precio, no deja quitar la línea y no baja de lo despachado', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <EditOrderItemsForm
        order={twoLineOrder({
          status: 'EN_ALMACEN',
          remissions: [
            buildRemission({
              items: [{ id: 'ri-1', orderItemId: 'item-1', quantity: '6' }],
            }),
          ],
        })}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Precio unitario línea 1')).toBeDisabled();
    expect(screen.getByLabelText('Precio unitario línea 2')).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Quitar línea 1' }),
    ).toBeDisabled();
    expect(screen.getByText('Despachado 6')).toBeInTheDocument();

    const quantity = screen.getByLabelText('Cantidad línea 1');
    await user.clear(quantity);
    await user.type(quantity, '3');
    await user.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    expect(
      screen.getByText(
        /ya se despacharon 6, la cantidad no puede quedar en menos/,
      ),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('avisa que lo agregado va a producción cuando el pedido ya pasó por ella', () => {
    renderWithClient(
      <EditOrderItemsForm
        order={twoLineOrder({ status: 'EN_ALMACEN' })}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Lo que agregues se manda a Producción/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /el pedido vuelve a producción hasta completar lo nuevo/,
      ),
    ).toBeInTheDocument();
  });

  it('no muestra el aviso de producción en un pedido pendiente', () => {
    renderWithClient(
      <EditOrderItemsForm order={twoLineOrder()} onSuccess={vi.fn()} />,
    );

    expect(
      screen.queryByText(/Lo que agregues se manda a Producción/),
    ).not.toBeInTheDocument();
  });
});
