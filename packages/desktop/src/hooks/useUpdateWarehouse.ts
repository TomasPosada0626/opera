import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Warehouse } from '../types/inventory';
import type { WarehouseInput } from './useCreateWarehouse';

export function useUpdateWarehouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: WarehouseInput & { id: string }) =>
      apiFetch<Warehouse>(`/warehouses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
  });
}
