import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { RemissionForm } from './RemissionForm';
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

const order = buildOrder({
  status: 'EN_ALMACEN',
  items: [
    {
      id: 'item-1',
      productId: 'product-1',
      product: { id: 'product-1', sku: 'PT-1', name: 'Silla de madera' },
      quantity: '10',
      unitPrice: '25',
    },
  ],
});

function postedBody(): Record<string, unknown> {
  const call = mockedApiFetch.mock.calls.find(
    (args: unknown[]) =>
      (args[1] as RequestInit | undefined)?.method === 'POST',
  ) as [string, RequestInit] | undefined;
  return JSON.parse(call?.[1].body as string) as Record<string, unknown>;
}

describe('RemissionForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('shows the pending quantity per line, excluding voided remissions', () => {
    renderWithClient(
      <RemissionForm
        order={{
          ...order,
          remissions: [
            buildRemission({
              items: [{ id: 'ri', orderItemId: 'item-1', quantity: '4' }],
            }),
            buildRemission({
              id: 'voided',
              voidedAt: '2026-01-21T00:00:00.000Z',
              items: [{ id: 'rv', orderItemId: 'item-1', quantity: '3' }],
            }),
          ],
        }}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByText(/Pendiente:/)).toHaveTextContent(
      'Pendiente: 6 de 10',
    );
  });

  it('requires at least one quantity to be entered', async () => {
    const user = userEvent.setup();
    renderWithClient(<RemissionForm order={order} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Crear remisión/ }));

    expect(
      screen.getByText(
        'Ingresa una cantidad a entregar en al menos un producto.',
      ),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('rejects a quantity that exceeds what is pending', async () => {
    const user = userEvent.setup();
    renderWithClient(<RemissionForm order={order} onSuccess={vi.fn()} />);

    await user.type(
      screen.getByLabelText('Cantidad a entregar de Silla de madera'),
      '11',
    );
    await user.click(screen.getByRole('button', { name: /Crear remisión/ }));

    expect(
      screen.getByText(/excede lo pendiente por entregar/),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('fills every pending quantity with "Despachar todo lo pendiente" and shows the value', async () => {
    const user = userEvent.setup();
    renderWithClient(<RemissionForm order={order} onSuccess={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: 'Despachar todo lo pendiente' }),
    );

    expect(
      screen.getByLabelText('Cantidad a entregar de Silla de madera'),
    ).toHaveValue(10);
    // 10 x 25 = 250
    expect(screen.getAllByText(/\$\s?250/).length).toBeGreaterThan(0);
  });

  // Lo que el cliente debe por la remisión lleva el IVA del pedido, igual
  // que lo calcula el backend (y es el tope del pago al recibir).
  it('adds the order VAT to the value of the remission', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <RemissionForm order={{ ...order, vatRate: '19' }} onSuccess={vi.fn()} />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Despachar todo lo pendiente' }),
    );

    // 250 + 19 % = 297,50
    expect(screen.getByText(/incluye IVA \$\s?47,5/)).toBeInTheDocument();
    expect(screen.getAllByText(/\$\s?297,5/).length).toBeGreaterThan(0);
  });

  it('submits a partial delivery with no payment by default (stays in cartera)', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'rem-1' });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<RemissionForm order={order} onSuccess={onSuccess} />);

    await user.type(
      screen.getByLabelText('Cantidad a entregar de Silla de madera'),
      '4',
    );
    await user.click(screen.getByRole('button', { name: /Crear remisión/ }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(postedBody()).toEqual({
      orderId: 'order-1',
      items: [{ orderItemId: 'item-1', quantity: 4 }],
    });
  });

  it('requires a valid amount when the client paid on delivery', async () => {
    const user = userEvent.setup();
    renderWithClient(<RemissionForm order={order} onSuccess={vi.fn()} />);

    await user.type(
      screen.getByLabelText('Cantidad a entregar de Silla de madera'),
      '2',
    );
    await user.click(screen.getByLabelText(/El cliente pagó al recibir/));
    await user.click(screen.getByRole('button', { name: /Crear remisión/ }));
    expect(
      screen.getByText('Ingresa el monto del pago (mayor a 0).'),
    ).toBeInTheDocument();

    // 2 x 25 = 50; pagar 80 se pasa del total de la remisión.
    await user.type(screen.getByLabelText('Monto'), '80');
    await user.click(screen.getByRole('button', { name: /Crear remisión/ }));
    expect(screen.getByText(/no puede superar/)).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('sends the initial payment with its method, date and reference', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'rem-1' });
    const user = userEvent.setup();
    renderWithClient(<RemissionForm order={order} onSuccess={vi.fn()} />);

    await user.type(
      screen.getByLabelText('Cantidad a entregar de Silla de madera'),
      '2',
    );
    await user.click(screen.getByLabelText(/El cliente pagó al recibir/));
    await user.click(screen.getByRole('button', { name: /^Todo/ }));
    await user.selectOptions(
      screen.getByLabelText('Medio de pago'),
      'TRANSFERENCIA',
    );
    await user.type(screen.getByLabelText(/Referencia/), 'Nequi 123');
    await user.click(screen.getByRole('button', { name: /Crear remisión/ }));

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    const body = postedBody() as {
      initialPayment: {
        amount: number;
        method: string;
        note: string;
        paidAt: string;
      };
    };
    expect(body.initialPayment).toEqual(
      expect.objectContaining({
        amount: 50,
        method: 'TRANSFERENCIA',
        note: 'Nequi 123',
      }),
    );
    expect(typeof body.initialPayment.paidAt).toBe('string');
  });

  it('shows the backend error message when the remission cannot be created', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(400, 'Stock insuficiente para despachar esta remisión', [
        { productName: 'Silla de madera', required: '4', available: '1' },
      ]),
    );
    const user = userEvent.setup();
    renderWithClient(<RemissionForm order={order} onSuccess={vi.fn()} />);

    await user.type(
      screen.getByLabelText('Cantidad a entregar de Silla de madera'),
      '4',
    );
    await user.click(screen.getByRole('button', { name: /Crear remisión/ }));

    expect(
      await screen.findByText(
        'Stock insuficiente para despachar esta remisión',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/necesita 4 · hay 1/)).toBeInTheDocument();
  });
});
