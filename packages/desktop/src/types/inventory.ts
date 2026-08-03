export interface Warehouse {
  id: string;
  name: string;
  location: string | null;
  isActive: boolean;
}

export type MovementType = 'ENTRADA' | 'SALIDA' | 'AJUSTE';

// Fila del Kardex (#44) — quantity ya viene con signo (negativo en SALIDA,
// con o sin signo en AJUSTE) y unitCost es siempre absoluto, ver ADR 0002.
export interface StockMovementEntry {
  id: string;
  type: MovementType;
  quantity: string;
  unitCost: string | null;
  reason: string | null;
  location: string | null;
  createdAt: string;
  warehouse: { id: string; name: string };
  user: { id: string; name: string };
}
