import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Supplier } from '../types/supplier';

// A diferencia de useSuppliers (listado paginado), esto trae un solo
// proveedor por id — usado por la vista de detalle.
export function useSupplier(supplierId: string) {
  return useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: () => apiFetch<Supplier>(`/suppliers/${supplierId}`),
  });
}
