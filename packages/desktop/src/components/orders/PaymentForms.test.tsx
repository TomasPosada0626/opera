import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AddPaymentForm, VoidPaymentForm } from './PaymentForms';
import { EditOrderTrackingForm } from './EditOrderTrackingForm';
import { DeliveryDate } from './OrderBadges';
import { apiFetch, ApiError } from '../../lib/api-client';
import { buildOrder, buildPayment, buildRemission } from '../../test/factories';

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

function lastCall(): [string, RequestInit] {
  const { calls } = mockedApiFetch.mock;
  return calls[calls.length - 1] as [string, RequestInit];
}

describe('AddPaymentForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  const remission = buildRemission({ total: '100', amountPaid: '30' });

  it('shows total, paid and pending, and posts a valid payment', async () => {
    mockedApiFetch.mockResolvedValue(remission);
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <AddPaymentForm
        orderId="order-1"
        remission={remission}
        onSuccess={onSuccess}
      />,
    );

    expect(screen.getByText('Saldo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Todo/ }));
    await user.click(screen.getByRole('button', { name: /Registrar abono/ }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [path, options] = lastCall();
    expect(path).toBe('/remissions/remission-1/payments');
    expect(JSON.parse(options.body as string)).toEqual(
      expect.objectContaining({ amount: 70, method: 'TRANSFERENCIA' }),
    );
  });

  it('refuses an amount over the pending balance without calling the API', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <AddPaymentForm
        orderId="order-1"
        remission={remission}
        onSuccess={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Monto'), '500');
    await user.click(screen.getByRole('button', { name: /Registrar abono/ }));

    expect(screen.getByText(/no puede superar/)).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('shows the backend message when the payment is rejected', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(
        409,
        'Otro abono se registró al mismo tiempo, intenta de nuevo',
      ),
    );
    const user = userEvent.setup();
    renderWithClient(
      <AddPaymentForm
        orderId="order-1"
        remission={remission}
        onSuccess={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Monto'), '10');
    await user.click(screen.getByRole('button', { name: /Registrar abono/ }));

    expect(
      await screen.findByText(
        'Otro abono se registró al mismo tiempo, intenta de nuevo',
      ),
    ).toBeInTheDocument();
  });
});

describe('VoidPaymentForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('requires a reason, then voids the payment', async () => {
    mockedApiFetch.mockResolvedValue(buildRemission());
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <VoidPaymentForm
        orderId="order-1"
        remissionId="remission-1"
        payment={buildPayment()}
        onSuccess={onSuccess}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Anular abono/ }));
    expect(screen.getByText(/mínimo 3 caracteres/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Motivo'), 'Cheque devuelto');
    await user.click(screen.getByRole('button', { name: /Anular abono/ }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [path, options] = lastCall();
    expect(path).toBe('/remissions/remission-1/payments/payment-1/void');
    expect(JSON.parse(options.body as string)).toEqual({
      reason: 'Cheque devuelto',
    });
  });
});

describe('EditOrderTrackingForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('saves a new date and clears empty notes as null', async () => {
    mockedApiFetch.mockResolvedValue(buildOrder());
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <EditOrderTrackingForm
        order={buildOrder({
          notes: 'vieja',
          estimatedDeliveryDate: '2026-02-01T00:00:00.000Z',
        })}
        onSuccess={onSuccess}
      />,
    );

    expect(screen.getByLabelText('Fecha de envío estimada')).toHaveValue(
      '2026-02-01',
    );
    await user.clear(screen.getByLabelText(/Notas/));
    await user.click(screen.getByRole('button', { name: /Guardar/ }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [path, options] = lastCall();
    expect(path).toBe('/orders/order-1');
    expect(JSON.parse(options.body as string)).toEqual({
      estimatedDeliveryDate: '2026-02-01',
      notes: null,
    });
  });
});

describe('DeliveryDate', () => {
  it('says when there is no date', () => {
    render(
      <DeliveryDate
        order={{ estimatedDeliveryDate: null, status: 'PENDIENTE' }}
      />,
    );
    expect(screen.getByText('Sin fecha')).toBeInTheDocument();
  });

  it('shows the countdown for an upcoming date and nothing extra once dispatched', () => {
    const inThreeDays = new Date();
    inThreeDays.setDate(inThreeDays.getDate() + 3);
    const iso = `${inThreeDays.getFullYear()}-${String(inThreeDays.getMonth() + 1).padStart(2, '0')}-${String(inThreeDays.getDate()).padStart(2, '0')}T00:00:00.000Z`;

    const { rerender } = render(
      <DeliveryDate
        order={{ estimatedDeliveryDate: iso, status: 'EN_PRODUCCION' }}
      />,
    );
    expect(screen.getByText('en 3 días')).toBeInTheDocument();

    rerender(
      <DeliveryDate
        order={{ estimatedDeliveryDate: iso, status: 'DESPACHADO' }}
      />,
    );
    expect(screen.queryByText('en 3 días')).not.toBeInTheDocument();
  });

  it('warns when the date is today', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T00:00:00.000Z`;
    render(
      <DeliveryDate
        order={{ estimatedDeliveryDate: iso, status: 'EN_ALMACEN' }}
      />,
    );
    expect(screen.getByText('Vence hoy')).toBeInTheDocument();
  });

  it('shows "mañana" for tomorrow and the singular for one day late', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const toIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00.000Z`;

    const { rerender } = render(
      <DeliveryDate
        order={{ estimatedDeliveryDate: toIso(tomorrow), status: 'PENDIENTE' }}
      />,
    );
    expect(screen.getByText('mañana')).toBeInTheDocument();

    rerender(
      <DeliveryDate
        order={{ estimatedDeliveryDate: toIso(yesterday), status: 'PENDIENTE' }}
      />,
    );
    expect(screen.getByText('1 día tarde')).toBeInTheDocument();
  });
});
