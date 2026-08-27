import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useUpdateSupplier } from './useUpdateSupplier';
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
    ...renderHook(() => useUpdateSupplier(), { wrapper }),
    invalidateQueries,
  };
}

describe('useUpdateSupplier', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  const body = { name: 'Maderas del Sur' };
  const input = { id: 'sup-1', ...body };

  it('PATCHes the supplier by id with the rest of the input as the body', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'sup-1', ...body });
    const { result } = renderWithClient();

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith('/suppliers/sup-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  });

  it('invalidates the suppliers list on success', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'sup-1', ...body });
    const { result, invalidateQueries } = renderWithClient();

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['suppliers'] });
  });
});
