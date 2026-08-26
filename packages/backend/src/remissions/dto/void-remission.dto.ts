import { IsString, MaxLength, MinLength } from 'class-validator';

export class VoidRemissionDto {
  // Obligatorio a propósito — anular sin motivo deja el ajuste de stock
  // resultante sin explicación en el Kardex (ver StockMovement.reason).
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
