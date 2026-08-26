import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { User } from '../types/user';

// Sin paginación — a diferencia de Clientes/Proveedores, la lista de
// usuarios la administra un único Administrador y se espera que sea
// pequeña (el backend tampoco pagina /users, ver UsersService.findAll).
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<User[]>('/users'),
  });
}
