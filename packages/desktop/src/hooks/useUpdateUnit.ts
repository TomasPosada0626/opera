import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Unit } from '../types/product';
import type { UnitInput } from './useCreateUnit';

export function useUpdateUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: UnitInput & { id: string }) =>
      apiFetch<Unit>(`/units/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['units'] });
    },
    meta: { successMessage: 'Unidad actualizada.' },
  });
}
