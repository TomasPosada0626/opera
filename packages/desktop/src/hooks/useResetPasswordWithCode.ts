import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';

export interface ResetPasswordWithCodeInput {
  email: string;
  code: string;
  newPassword: string;
}

export function useResetPasswordWithCode() {
  return useMutation({
    mutationFn: (body: ResetPasswordWithCodeInput) =>
      apiFetch<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}
