import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { DashboardSummary } from '../types/dashboard';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'resumen'],
    queryFn: () => apiFetch<DashboardSummary>('/dashboard/resumen'),
  });
}
