import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { User } from '../types/user';

export function useAnonymizeUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<User>(`/users/${id}/anonymize`, { method: 'PATCH' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    meta: { successMessage: 'Datos personales del usuario eliminados.' },
  });
}
