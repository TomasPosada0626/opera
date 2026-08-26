import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { EditRemissionPaymentForm } from './EditRemissionPaymentForm';
import { apiFetch, ApiError } from '../../lib/api-client';
import type { Remission } from '../../types/order';

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

function buildRemission(overrides: Partial<Remission> = {}): Remission {
  return {
    id: 'remission-1',
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

function findPatchCall(): [string, RequestInit] | undefined {
  return mockedApiFetch.mock.calls.find(
    (call: unknown[]) =>
      (call[1] as RequestInit | undefined)?.method === 'PATCH',
  ) as [string, RequestInit] | undefined;
}

describe('EditRemissionPaymentForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('preselects the remission current payment status', () => {
    renderWithClient(
      <EditRemissionPaymentForm
        orderId="order-1"
        remission={buildRemission({ paymentStatus: 'PAGADO' })}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Estado de pago')).toHaveValue('PAGADO');
    expect(screen.queryByLabelText('Cuánto abonó')).not.toBeInTheDocument();
  });

  it('shows the amount field pre-filled when the remission is already ABONADO', () => {
    renderWithClient(
      <EditRemissionPaymentForm
        orderId="order-1"
        remission={buildRemission({
          paymentStatus: 'ABONADO',
          amountPaid: '50',
        })}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Cuánto abonó')).toHaveValue(50);
  });

  it('requires an amount when switching to "Abonó"', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <EditRemissionPaymentForm
        orderId="order-1"
        remission={buildRemission()}
        onSuccess={vi.fn()}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText('Estado de pago'),
      'ABONADO',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Ingresa cuánto abonó (mayor a 0).'),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('submits the new payment status against PATCH /remissions/:id/payment', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'remission-1' });
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(
      <EditRemissionPaymentForm
        orderId="order-1"
        remission={buildRemission()}
        onSuccess={onSuccess}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Estado de pago'), 'PAGADO');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const patchCall = findPatchCall();
    expect(patchCall?.[0]).toBe('/remissions/remission-1/payment');
    expect(JSON.parse(patchCall?.[1].body as string)).toEqual({
      paymentStatus: 'PAGADO',
      amountPaid: undefined,
    });
  });

  it('shows the backend error message when updating the payment fails', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(404, 'Remisión no encontrada'),
    );
    const user = userEvent.setup();
    renderWithClient(
      <EditRemissionPaymentForm
        orderId="order-1"
        remission={buildRemission()}
        onSuccess={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Remisión no encontrada'),
    ).toBeInTheDocument();
  });
});
