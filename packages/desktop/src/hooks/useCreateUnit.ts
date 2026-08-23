import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Unit } from '../types/product';

export interface UnitInput {
  name: string;
  abbreviation: string;
}

export function useCreateUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UnitInput) =>
      apiFetch<Unit>('/units', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['units'] });
    },
  });
}
