export interface GlobalSearchResult {
  products: { id: string; sku: string; name: string }[];
  customers: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  remissions: { id: string; number: number; orderId: string }[];
  productionOrders: {
    id: string;
    status: 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADA';
    product: { id: string; sku: string; name: string };
  }[];
}
