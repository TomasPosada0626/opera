import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  NotEquals,
} from 'class-validator';

export class CreateAdjustmentDto {
  @IsUUID('4')
  productId: string;

  @IsUUID('4')
  warehouseId: string;

  // Con signo: positivo corrige hacia arriba, negativo hacia abajo. Nunca 0
  // — un ajuste que no cambia nada no es un ajuste.
  @IsNumber()
  @NotEquals(0)
  quantity: number;

  // A diferencia de entrada/salida, el motivo es obligatorio: un ajuste
  // siempre corrige una discrepancia y esa razón debe quedar registrada.
  @IsNotEmpty()
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  location?: string;
}
