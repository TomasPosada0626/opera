import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useResetUserPassword } from './useResetUserPassword';
import { apiFetch } from '../lib/api-client';

vi.mock('../lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = apiFetch as unknown as Mock;

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useResetUserPassword', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it('PATCHes the reset-password endpoint with the new password', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'user-1' });
    const { result } = renderHook(() => useResetUserPassword(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ id: 'user-1', newPassword: 'S3guro!23456' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/users/user-1/reset-password',
      {
        method: 'PATCH',
        body: JSON.stringify({ newPassword: 'S3guro!23456' }),
      },
    );
  });

  it('surfaces the error on failure', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useResetUserPassword(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ id: 'user-1', newPassword: 'S3guro!23456' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
