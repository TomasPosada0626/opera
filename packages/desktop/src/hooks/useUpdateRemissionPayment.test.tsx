import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useUpdateRemissionPayment } from './useUpdateRemissionPayment';
import { apiFetch } from '../lib/api-client';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    ...renderHook(() => useUpdateRemissionPayment(), { wrapper }),
    invalidateQueries,
  };
}

describe('useUpdateRemissionPayment', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  const input = {
    remissionId: 'rem-1',
    orderId: 'order-1',
    paymentStatus: 'ABONADO' as const,
    amountPaid: 50000,
  };

  it('PATCHes the payment endpoint without leaking orderId into the body', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'rem-1' });
    const { result } = renderWithClient();

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith('/remissions/rem-1/payment', {
      method: 'PATCH',
      body: JSON.stringify({ paymentStatus: 'ABONADO', amountPaid: 50000 }),
    });
  });

  it('invalidates only the owning order on success (no stock movement)', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'rem-1' });
    const { result, invalidateQueries } = renderWithClient();

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['order', 'order-1'],
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['stock-summary'],
    });
  });
});
