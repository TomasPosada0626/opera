import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { InventoryReportRow } from '../types/report';

export function useInventoryReport() {
  return useQuery({
    queryKey: ['reports', 'inventario'],
    queryFn: () => apiFetch<InventoryReportRow[]>('/reports/inventario'),
  });
}
