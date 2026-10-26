export interface Customer {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  // Datos de la remisión impresa (formato en papel de Herrajes Toro).
  city: string | null;
  country: string | null;
  mobile: string | null;
  zone: string | null;
  salesRep: string | null;
  paymentTerms: string | null;
  isActive: boolean;
}
