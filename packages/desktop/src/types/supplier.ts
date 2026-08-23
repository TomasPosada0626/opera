export interface Supplier {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
}

// Solo los campos escalares de Product en las relaciones — mismo espíritu
// que OrderItemProduct en types/order.ts.
export interface SupplierProductRef {
  id: string;
  sku: string;
  name: string;
}

export interface SupplierProduct {
  id: string;
  price: string;
  product: SupplierProductRef;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPurchase {
  id: string;
  quantity: string;
  unitCost: string;
  purchasedAt: string;
  product: SupplierProductRef;
  user: { id: string; name: string };
}
