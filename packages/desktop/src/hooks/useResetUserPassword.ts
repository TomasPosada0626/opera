import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { User } from '../types/user';

// Sin invalidar `users` — resetear la contraseña no cambia nada que la
// tabla muestre, y el nuevo valor nunca vuelve del backend (ver
// UsersService.resetPassword: la respuesta jamás incluye password).
export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      apiFetch<User>(`/users/${id}/reset-password`, {
        method: 'PATCH',
        body: JSON.stringify({ newPassword }),
      }),
  });
}
