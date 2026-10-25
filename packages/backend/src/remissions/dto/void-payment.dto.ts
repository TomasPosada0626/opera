import { IsString, MaxLength, MinLength } from 'class-validator';

export class VoidPaymentDto {
  // Obligatorio, mismo criterio que VoidRemissionDto: un abono anulado sin
  // motivo deja un hueco sin explicación en el historial de cobro.
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
