import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';

export interface RecoveryCodeStatus {
  hasRecoveryCode: boolean;
  createdAt: string | null;
}

export interface RecoveryOptions {
  email: boolean;
  recoveryCode: boolean;
}

export function useRecoveryCodeStatus(enabled = true) {
  return useQuery({
    queryKey: ['recovery-code-status'],
    queryFn: () => apiFetch<RecoveryCodeStatus>('/auth/recovery-code'),
    enabled,
  });
}

// Genera un código nuevo (reemplaza al anterior). La respuesta trae el
// código en claro esta única vez — después solo existe su hash.
export function useIssueRecoveryCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiFetch<{ recoveryCode: string }>('/auth/recovery-code', {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['recovery-code-status'],
      });
    },
  });
}

// Público: qué vías de recuperación ofrece esta instalación (el correo solo
// si SMTP está configurado).
export function useRecoveryOptions() {
  return useQuery({
    queryKey: ['recovery-options'],
    queryFn: () => apiFetch<RecoveryOptions>('/auth/recovery-options'),
  });
}

export interface ResetWithRecoveryCodeInput {
  email: string;
  recoveryCode: string;
  newPassword: string;
}

export function useResetWithRecoveryCode() {
  return useMutation({
    mutationFn: (body: ResetWithRecoveryCodeInput) =>
      apiFetch<{ recoveryCode: string }>(
        '/auth/reset-password-with-recovery-code',
        { method: 'POST', body: JSON.stringify(body) },
      ),
  });
}
