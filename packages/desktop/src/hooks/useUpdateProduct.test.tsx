import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useUpdateProduct } from './useUpdateProduct';
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
    ...renderHook(() => useUpdateProduct(), { wrapper }),
    invalidateQueries,
  };
}

describe('useUpdateProduct', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  const body = {
    sku: 'PT-1',
    name: 'Silla',
    type: 'FINISHED_GOOD' as const,
    categoryId: 'cat-1',
    unitId: 'unit-1',
  };
  const input = { id: 'prod-1', ...body };

  it('PATCHes the product by id with the rest of the input as the body', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'prod-1', name: 'Silla' });
    const { result } = renderWithClient();

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith('/products/prod-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  });

  it('invalidates the products list on success', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'prod-1', name: 'Silla' });
    const { result, invalidateQueries } = renderWithClient();

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['products'] });
  });
});
