import { createElement, type ReactNode } from 'react';
import { QueryClientProvider, useMutation } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from './query-client';
import { toast } from './toast';

vi.mock('./toast', () => ({ toast: { success: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('queryClient mutationCache', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
  });

  it('shows a success toast when the mutation declares meta.successMessage', async () => {
    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: () => Promise.resolve('ok'),
          meta: { successMessage: 'Listo.' },
        }),
      { wrapper },
    );

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Listo.');
  });

  it('does not show a toast when the mutation has no successMessage', async () => {
    const { result } = renderHook(
      () => useMutation({ mutationFn: () => Promise.resolve('ok') }),
      { wrapper },
    );

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
