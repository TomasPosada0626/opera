import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useCreateRemission } from './useCreateRemission';
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
    ...renderHook(() => useCreateRemission(), { wrapper }),
    invalidateQueries,
  };
}

describe('useCreateRemission', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  const input = {
    orderId: 'order-1',
    paymentStatus: 'CARTERA' as const,
    items: [{ orderItemId: 'item-1', quantity: 2 }],
  };

  it('POSTs to /remissions with the order id back inside the body', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'rem-1' });
    const { result } = renderWithClient();

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith('/remissions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  });

  it('invalidates the owning order and the stock summary on success', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'rem-1' });
    const { result, invalidateQueries } = renderWithClient();

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['order', 'order-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['stock-summary'],
    });
  });
});
