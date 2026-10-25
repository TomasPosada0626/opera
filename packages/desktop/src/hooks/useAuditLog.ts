import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { AuditEntry } from '../types/audit';

interface UseAuditLogParams {
  page: number;
  pageSize: number;
  entity?: string;
  // "AAAA-MM-DD"; intervalo [from, to) igual que el backend.
  from?: string;
  to?: string;
}

export function useAuditLog({
  page,
  pageSize,
  entity,
  from,
  to,
}: UseAuditLogParams) {
  return useQuery({
    queryKey: ['audit', { page, pageSize, entity, from, to }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (entity) {
        params.set('entity', entity);
      }
      if (from) {
        params.set('from', from);
      }
      if (to) {
        params.set('to', to);
      }
      return apiFetch<PaginatedResult<AuditEntry>>(
        `/audit?${params.toString()}`,
      );
    },
    placeholderData: (previousData) => previousData,
  });
}
