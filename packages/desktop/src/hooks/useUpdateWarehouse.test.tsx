import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useUpdateWarehouse } from './useUpdateWarehouse';
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
    ...renderHook(() => useUpdateWarehouse(), { wrapper }),
    invalidateQueries,
  };
}

describe('useUpdateWarehouse', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  const body = { name: 'Bodega Norte', location: 'Zona industrial' };
  const input = { id: 'wh-1', ...body };

  it('PATCHes the warehouse by id with the rest of the input as the body', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'wh-1', ...body, isActive: true });
    const { result } = renderWithClient();

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith('/warehouses/wh-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  });

  it('invalidates the warehouses list on success', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'wh-1', ...body, isActive: true });
    const { result, invalidateQueries } = renderWithClient();

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['warehouses'],
    });
  });
});
