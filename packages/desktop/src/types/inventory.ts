export interface Warehouse {
  id: string;
  name: string;
  location: string | null;
  isActive: boolean;
}

export type MovementType = 'ENTRADA' | 'SALIDA' | 'AJUSTE';
