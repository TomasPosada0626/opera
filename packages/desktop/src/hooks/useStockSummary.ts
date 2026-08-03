import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api-client';
import type { StockSummary } from '../types/product';

// Un solo GET /inventory/stock para todas las filas de la página en vez de
// una request por producto (ver InventoryService.getStockForProducts, #42).
export function useStockSummary(productIds: string[]) {
  return useQuery({
    queryKey: ['stock-summary', productIds],
    queryFn: () => {
      const params = new URLSearchParams({ productIds: productIds.join(',') });
      return apiFetch<StockSummary[]>(`/inventory/stock?${params.toString()}`);
    },
    enabled: productIds.length > 0,
  });
}
