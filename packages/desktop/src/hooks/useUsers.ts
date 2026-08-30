import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { PaginatedResult } from '../types/product';
import type { User } from '../types/user';

interface UseUsersParams {
  page: number;
  pageSize: number;
  search?: string;
}

// Pagina igual que Clientes/Proveedores (#20, auditoría) — antes traía
// todos los usuarios de una sola vez porque el backend tampoco paginaba
// (ver UsersService.findAll).
export function useUsers({ page, pageSize, search }: UseUsersParams) {
  return useQuery({
    queryKey: ['users', { page, pageSize, search }],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) {
        params.set('search', search);
      }
      return apiFetch<PaginatedResult<User>>(`/users?${params.toString()}`);
    },
    placeholderData: (previousData) => previousData,
  });
}
