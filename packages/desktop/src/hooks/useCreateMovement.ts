import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { MovementType } from '../types/inventory';

export interface CreateMovementInput {
  type: MovementType;
  productId: string;
  warehouseId: string;
  quantity: number;
  reason?: string;
  location?: string;
  unitCost?: number;
}

const endpointByType: Record<MovementType, string> = {
  ENTRADA: '/inventory/entradas',
  SALIDA: '/inventory/salidas',
  AJUSTE: '/inventory/ajustes',
};

export function useCreateMovement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ type, ...body }: CreateMovementInput) =>
      apiFetch(endpointByType[type], {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    // El catálogo (productos) no cambia, solo el stock derivado — no hace
    // falta invalidar 'products'.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock-summary'] });
    },
  });
}
