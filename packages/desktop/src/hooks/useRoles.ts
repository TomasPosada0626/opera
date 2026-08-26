import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Role } from '../types/role';

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => apiFetch<Role[]>('/roles'),
  });
}
