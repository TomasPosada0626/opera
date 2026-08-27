import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { VoidRemissionForm } from './VoidRemissionForm';
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

describe('VoidRemissionForm', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('requires a reason of at least 3 characters', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <VoidRemissionForm
        orderId="order-1"
        remission={buildRemission()}
        onSuccess={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Motivo de la anulación'), 'ab');
    await user.click(screen.getByRole('button', { name: 'Anular remisión' }));

    expect(
      await screen.findByText(
        'Ingresa el motivo de la anulación (mínimo 3 caracteres).',
      ),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('rejects a reason that is only whitespace', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <VoidRemissionForm
        orderId="order-1"
        remission={buildRemission()}
        onSuccess={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Motivo de la anulación'), '     ');
    await user.click(screen.getByRole('button', { name: 'Anular remisión' }));

    expect(
      await screen.findByText(
        'Ingresa el motivo de la anulación (mínimo 3 caracteres).',
      ),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('submits the trimmed reason for the given remission', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'rem-1' });
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithClient(
      <VoidRemissionForm
        orderId="order-1"
        remission={buildRemission()}
        onSuccess={onSuccess}
      />,
    );

    await user.type(
      screen.getByLabelText('Motivo de la anulación'),
      '  Cantidad errada  ',
    );
    await user.click(screen.getByRole('button', { name: 'Anular remisión' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockedApiFetch).toHaveBeenCalledWith('/remissions/rem-1/void', {
      method: 'PATCH',
      body: JSON.stringify({ reason: 'Cantidad errada' }),
    });
  });

  it('shows the backend error message when voiding fails', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, 'La remisión ya está anulada'),
    );
    const user = userEvent.setup();
    renderWithClient(
      <VoidRemissionForm
        orderId="order-1"
        remission={buildRemission()}
        onSuccess={vi.fn()}
      />,
    );

    await user.type(
      screen.getByLabelText('Motivo de la anulación'),
      'Cantidad errada',
    );
    await user.click(screen.getByRole('button', { name: 'Anular remisión' }));

    expect(
      await screen.findByText('La remisión ya está anulada'),
    ).toBeInTheDocument();
  });

  it('shows a generic error message for a non-API failure', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWithClient(
      <VoidRemissionForm
        orderId="order-1"
        remission={buildRemission()}
        onSuccess={vi.fn()}
      />,
    );

    await user.type(
      screen.getByLabelText('Motivo de la anulación'),
      'Cantidad errada',
    );
    await user.click(screen.getByRole('button', { name: 'Anular remisión' }));

    expect(
      await screen.findByText(
        'No se pudo anular la remisión. Intenta de nuevo.',
      ),
    ).toBeInTheDocument();
  });
});
