import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useWarehouses } from './useWarehouses';
import { apiFetch } from '../lib/api-client';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(params?: Parameters<typeof useWarehouses>[0]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useWarehouses(params), { wrapper });
}

describe('useWarehouses', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('defaults to page 1 / pageSize 100 with no search when called without arguments', async () => {
    mockedApiFetch.mockResolvedValue({ data: [], meta: {} });
    const { result } = renderWithClient();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/warehouses?page=1&pageSize=100',
    );
  });

  it('uses the explicit page/pageSize/search when given', async () => {
    mockedApiFetch.mockResolvedValue({ data: [], meta: {} });
    const { result } = renderWithClient({
      page: 2,
      pageSize: 10,
      search: 'norte',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/warehouses?page=2&pageSize=10&search=norte',
    );
  });
});
