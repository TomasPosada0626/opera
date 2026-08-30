import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Warehouse } from '../types/inventory';

export interface WarehouseInput {
  name: string;
  location?: string;
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: WarehouseInput) =>
      apiFetch<Warehouse>('/warehouses', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
    meta: { successMessage: 'Bodega creada.' },
  });
}
