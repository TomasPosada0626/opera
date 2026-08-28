import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
  });
}
