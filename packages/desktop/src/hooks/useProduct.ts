import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { Product } from '../types/product';

// A diferencia de useProducts (listado paginado), esto trae un solo
// producto por id — usado por la vista de Kardex (#44) para mostrar
// nombre/SKU en el encabezado sin repetir la búsqueda paginada.
export function useProduct(productId: string) {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: () => apiFetch<Product>(`/products/${productId}`),
  });
}
