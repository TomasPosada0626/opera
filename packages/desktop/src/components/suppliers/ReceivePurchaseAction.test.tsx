import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ReceivePurchaseAction } from './ReceivePurchaseAction';
import { apiFetch, ApiError } from '../../lib/api-client';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  };
}

describe('ReceivePurchaseAction', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('calls POST /supplier-purchases/:id/receive when "Marcar recibida" is clicked', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'sp-1', status: 'RECIBIDA' });
    const user = userEvent.setup();
    renderWithClient(<ReceivePurchaseAction purchaseId="sp-1" />);

    await user.click(screen.getByRole('button', { name: 'Marcar recibida' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/supplier-purchases/sp-1/receive',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('invalidates both supplier-purchases and stock-summary on success', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'sp-1', status: 'RECIBIDA' });
    const user = userEvent.setup();
    const { queryClient } = renderWithClient(
      <ReceivePurchaseAction purchaseId="sp-1" />,
    );
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: 'Marcar recibida' }));

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['supplier-purchases'],
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['stock-summary'],
    });
  });

  it('shows an inline error when receiving fails', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(409, 'La compra ya fue recibida'),
    );
    const user = userEvent.setup();
    renderWithClient(<ReceivePurchaseAction purchaseId="sp-1" />);

    await user.click(screen.getByRole('button', { name: 'Marcar recibida' }));

    expect(
      await screen.findByText('La compra ya fue recibida'),
    ).toBeInTheDocument();
  });

  it('shows a generic error message when the failure is not an ApiError', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWithClient(<ReceivePurchaseAction purchaseId="sp-1" />);

    await user.click(screen.getByRole('button', { name: 'Marcar recibida' }));

    expect(
      await screen.findByText('No se pudo marcar como recibida.'),
    ).toBeInTheDocument();
  });

  it('disables the button while the mutation is pending', async () => {
    let resolveFetch!: (value: unknown) => void;
    mockedApiFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const user = userEvent.setup();
    renderWithClient(<ReceivePurchaseAction purchaseId="sp-1" />);

    await user.click(screen.getByRole('button', { name: 'Marcar recibida' }));

    expect(screen.getByRole('button', { name: 'Recibiendo…' })).toBeDisabled();

    resolveFetch({ id: 'sp-1', status: 'RECIBIDA' });
  });
});
