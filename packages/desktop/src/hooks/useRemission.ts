import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { RemissionDetail } from '../types/order';

// Trae una remisión suelta por id, sin pasar por su pedido — usada por la
// vista de impresión, que puede abrirse directo desde un link o desde una
// búsqueda por número, no solo desde OrderDetailPage.
export function useRemission(remissionId: string) {
  return useQuery({
    queryKey: ['remission', remissionId],
    queryFn: () => apiFetch<RemissionDetail>(`/remissions/${remissionId}`),
    enabled: remissionId.length > 0,
  });
}
