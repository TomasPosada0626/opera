import {
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateEntryDto {
  @IsUUID('4')
  productId: string;

  @IsUUID('4')
  warehouseId: string;

  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  // Costo pagado al recibir esta entrada (ver ADR 0002) — opcional; sin él,
  // el cálculo de costo promedio ponderado (#34) asume el promedio vigente
  // en vez de distorsionarlo con un costo desconocido.
  @IsOptional()
  @IsPositive()
  unitCost?: number;
}
