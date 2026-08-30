import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Warehouse } from '../types/inventory';

export function useDeactivateWarehouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Warehouse>(`/warehouses/${id}/deactivate`, { method: 'PATCH' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
    meta: { successMessage: 'Bodega desactivada.' },
  });
}
