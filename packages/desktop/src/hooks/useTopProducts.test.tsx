import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useTopProducts } from './useTopProducts';
import { apiFetch } from '../lib/api-client';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(params: Parameters<typeof useTopProducts>[0]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTopProducts(params), { wrapper });
}

describe('useTopProducts', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('builds the query string with sortOrder but without limit when not given', async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { result } = renderWithClient({ sortOrder: 'desc' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/reports/productos-mas-vendidos?sortOrder=desc',
    );
  });

  it('includes limit and the date range when given', async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { result } = renderWithClient({
      sortOrder: 'asc',
      limit: 5,
      from: '2026-01-01',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/reports/productos-mas-vendidos?from=2026-01-01&sortOrder=asc&limit=5',
    );
  });
});
