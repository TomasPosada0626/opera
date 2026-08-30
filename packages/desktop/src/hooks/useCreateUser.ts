import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { User } from '../types/user';

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  roleIds?: string[];
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateUserInput) =>
      apiFetch<User>('/users', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    meta: { successMessage: 'Usuario creado.' },
  });
}
