import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useUpdateCategory } from './useUpdateCategory';
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
    ...renderHook(() => useUpdateCategory(), { wrapper }),
    invalidateQueries,
  };
}

describe('useUpdateCategory', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('PATCHes the category by id with the rest of the input as the body', async () => {
    mockedApiFetch.mockResolvedValue({
      id: 'cat-1',
      name: 'Maderas',
      isActive: true,
    });
    const { result } = renderWithClient();

    result.current.mutate({ id: 'cat-1', name: 'Maderas' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith('/categories/cat-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Maderas' }),
    });
  });

  it('invalidates the categories list on success', async () => {
    mockedApiFetch.mockResolvedValue({
      id: 'cat-1',
      name: 'Maderas',
      isActive: true,
    });
    const { result, invalidateQueries } = renderWithClient();

    result.current.mutate({ id: 'cat-1', name: 'Maderas' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['categories'],
    });
  });
});
