import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { ReceivablesRow } from '../types/report';

export function useReceivablesReport() {
  return useQuery({
    queryKey: ['receivables'],
    queryFn: () => apiFetch<ReceivablesRow[]>('/reports/cartera'),
  });
}
