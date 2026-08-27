import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useUpdateUnit } from './useUpdateUnit';
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
    ...renderHook(() => useUpdateUnit(), { wrapper }),
    invalidateQueries,
  };
}

describe('useUpdateUnit', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  const body = { name: 'Kilogramo', abbreviation: 'kg' };
  const input = { id: 'unit-1', ...body };

  it('PATCHes the unit by id with the rest of the input as the body', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'unit-1', ...body, isActive: true });
    const { result } = renderWithClient();

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith('/units/unit-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  });

  it('invalidates the units list on success', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'unit-1', ...body, isActive: true });
    const { result, invalidateQueries } = renderWithClient();

    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['units'] });
  });
});
