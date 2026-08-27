import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useUpdateCustomer } from './useUpdateCustomer';
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
    ...renderHook(() => useUpdateCustomer(), { wrapper }),
    invalidateQueries,
  };
}

describe('useUpdateCustomer', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('PATCHes the customer by id with the rest of the input as the body', async () => {
    mockedApiFetch.mockResolvedValue({
      id: 'cust-1',
      name: 'Muebles del Valle',
    });
    const { result } = renderWithClient();

    result.current.mutate({ id: 'cust-1', name: 'Muebles del Valle' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith('/customers/cust-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Muebles del Valle' }),
    });
  });

  it('invalidates the customers list on success', async () => {
    mockedApiFetch.mockResolvedValue({
      id: 'cust-1',
      name: 'Muebles del Valle',
    });
    const { result, invalidateQueries } = renderWithClient();

    result.current.mutate({ id: 'cust-1', name: 'Muebles del Valle' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['customers'] });
  });
});
