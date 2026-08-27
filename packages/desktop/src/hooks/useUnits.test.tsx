import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useUnits } from './useUnits';
import { apiFetch } from '../lib/api-client';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(params: Parameters<typeof useUnits>[0]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useUnits(params), { wrapper });
}

describe('useUnits', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('builds the query string with page/pageSize but without search when not given', async () => {
    mockedApiFetch.mockResolvedValue({ data: [], meta: {} });
    const { result } = renderWithClient({ page: 1, pageSize: 20 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith('/units?page=1&pageSize=20');
  });

  it('includes search when given', async () => {
    mockedApiFetch.mockResolvedValue({ data: [], meta: {} });
    const { result } = renderWithClient({
      page: 2,
      pageSize: 10,
      search: 'kg',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/units?page=2&pageSize=10&search=kg',
    );
  });
});
