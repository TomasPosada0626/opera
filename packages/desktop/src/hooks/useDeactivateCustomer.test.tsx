import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useDeactivateCustomer } from './useDeactivateCustomer';
import { apiFetch } from '../lib/api-client';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { Wrapper, invalidateSpy };
}

describe('useDeactivateCustomer', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('PATCHes the deactivate endpoint for the given id', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'cust-1', isActive: false });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useDeactivateCustomer(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate('cust-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/customers/cust-1/deactivate',
      {
        method: 'PATCH',
      },
    );
  });

  it('invalidates the customers query on success', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'cust-1', isActive: false });
    const { Wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useDeactivateCustomer(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate('cust-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['customers'] });
  });

  it('surfaces the error without invalidating on failure', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    const { Wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useDeactivateCustomer(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate('cust-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
