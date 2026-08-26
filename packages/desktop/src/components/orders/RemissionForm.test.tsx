import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { RemissionForm } from './RemissionForm';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { Order, Remission } from '../../types/order';

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
        quantity: '10',
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

function buildRemission(overrides: Partial<Remission> = {}): Remission {
  return {
    id: 'rem-1',
    number: 1,
    createdAt: '2026-01-16T10:00:00.000Z',
    user: { id: 'user-1', name: 'Admin' },
    items: [],
    paymentStatus: 'CARTERA',
    amountPaid: null,
    voidedAt: null,
    voidReason: null,
    ...overrides,
  };
}

function findPostCall(): [string, RequestInit] | undefined {
  return mockedApiFetch.mock.calls.find(
    (call: unknown[]) =>
      (call[1] as RequestInit | undefined)?.method === 'POST',
  ) as [string, RequestInit] | undefined;
}

describe('RemissionForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('shows the pending quantity per line', () => {
    const order = buildOrder({
      remissions: [
        buildRemission({
          items: [{ id: 'ri-1', orderItemId: 'item-1', quantity: '4' }],
        }),
      ],
    });
    renderWithClient(<RemissionForm order={order} onSuccess={vi.fn()} />);

    expect(screen.getByText('Pendiente: 6 de 10')).toBeInTheDocument();
  });

  it('requires at least one quantity to be entered', async () => {
    const order = buildOrder();
    const user = userEvent.setup();
    renderWithClient(<RemissionForm order={order} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Crear remisión' }));

    expect(
      await screen.findByText(
        'Ingresa una cantidad a entregar en al menos un producto.',
      ),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('rejects a quantity that exceeds what is pending', async () => {
    const order = buildOrder();
    const user = userEvent.setup();
    renderWithClient(<RemissionForm order={order} onSuccess={vi.fn()} />);

    const input = screen.getByLabelText(
      'Cantidad a entregar de Silla de madera',
    );
    await user.type(input, '15');
    // fireEvent.submit, no user.click en el botón: el input tiene
    // max={remaining} y el <form> no lleva noValidate, así que un click real
    // dispara la validación HTML5 nativa (rangeOverflow) ANTES de llegar al
    // handler de React — el submit ni se dispara. Esto prueba la regla de
    // negocio de handleSubmit en sí (defensa en profundidad si el atributo
    // max alguna vez se desincroniza), no el camino feliz de un click.
    fireEvent.submit(input.closest('form')!);

    expect(
      await screen.findByText(
        'Silla de madera: la cantidad excede lo pendiente por entregar (10).',
      ),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('disables the input once a line has nothing left to deliver', () => {
    const order = buildOrder({
      remissions: [
        buildRemission({
          items: [{ id: 'ri-1', orderItemId: 'item-1', quantity: '10' }],
        }),
      ],
    });
    renderWithClient(<RemissionForm order={order} onSuccess={vi.fn()} />);

    expect(
      screen.getByLabelText('Cantidad a entregar de Silla de madera'),
    ).toBeDisabled();
  });

  it('submits a partial delivery with the right body', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'rem-2' });
    const order = buildOrder();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(<RemissionForm order={order} onSuccess={onSuccess} />);

    await user.type(
      screen.getByLabelText('Cantidad a entregar de Silla de madera'),
      '6',
    );
    await user.click(screen.getByRole('button', { name: 'Crear remisión' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const postCall = findPostCall();
    expect(postCall?.[0]).toBe('/remissions');
    expect(JSON.parse(postCall?.[1].body as string)).toEqual({
      orderId: 'order-1',
      paymentStatus: 'CARTERA',
      amountPaid: undefined,
      items: [{ orderItemId: 'item-1', quantity: 6 }],
    });
  });

  it('requires an amount when the payment status is "Abonó"', async () => {
    const order = buildOrder();
    const user = userEvent.setup();
    renderWithClient(<RemissionForm order={order} onSuccess={vi.fn()} />);

    await user.type(
      screen.getByLabelText('Cantidad a entregar de Silla de madera'),
      '6',
    );
    await user.selectOptions(
      screen.getByLabelText('Estado de pago'),
      'ABONADO',
    );
    await user.click(screen.getByRole('button', { name: 'Crear remisión' }));

    expect(
      await screen.findByText('Ingresa cuánto abonó (mayor a 0).'),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('submits the payment status and amount paid', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'rem-2' });
    const order = buildOrder();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(<RemissionForm order={order} onSuccess={onSuccess} />);

    await user.type(
      screen.getByLabelText('Cantidad a entregar de Silla de madera'),
      '6',
    );
    await user.selectOptions(
      screen.getByLabelText('Estado de pago'),
      'ABONADO',
    );
    await user.type(screen.getByLabelText('Cuánto abonó'), '50');
    await user.click(screen.getByRole('button', { name: 'Crear remisión' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const postCall = findPostCall();
    expect(JSON.parse(postCall?.[1].body as string)).toEqual({
      orderId: 'order-1',
      paymentStatus: 'ABONADO',
      amountPaid: 50,
      items: [{ orderItemId: 'item-1', quantity: 6 }],
    });
  });

  it('shows the backend error message when the remission cannot be created', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, 'Conflicto al registrar la remisión, intenta de nuevo'),
    );
    const order = buildOrder();
    const user = userEvent.setup();
    renderWithClient(<RemissionForm order={order} onSuccess={vi.fn()} />);

    await user.type(
      screen.getByLabelText('Cantidad a entregar de Silla de madera'),
      '6',
    );
    await user.click(screen.getByRole('button', { name: 'Crear remisión' }));

    expect(
      await screen.findByText(
        'Conflicto al registrar la remisión, intenta de nuevo',
      ),
    ).toBeInTheDocument();
  });
});
