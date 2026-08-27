import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useSalesReport, dateRangeSearchParams } from './useSalesReport';
import { apiFetch } from '../lib/api-client';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function renderWithClient(params: Parameters<typeof useSalesReport>[0]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSalesReport(params), { wrapper });
}

describe('dateRangeSearchParams', () => {
  it('omits keys for params that are not set', () => {
    expect(dateRangeSearchParams({}).toString()).toBe('');
  });

  it('includes only the params that are set', () => {
    expect(dateRangeSearchParams({ from: '2026-01-01' }).toString()).toBe(
      'from=2026-01-01',
    );
  });
});

describe('useSalesReport', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('fetches the plain endpoint when no date range is given', async () => {
    mockedApiFetch.mockResolvedValue({ total: 0, orders: [] });
    const { result } = renderWithClient({});

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith('/reports/ventas');
  });

  it('appends the date range as a query string when given', async () => {
    mockedApiFetch.mockResolvedValue({ total: 0, orders: [] });
    const { result } = renderWithClient({
      from: '2026-01-01',
      to: '2026-01-31',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/reports/ventas?from=2026-01-01&to=2026-01-31',
    );
  });
});
