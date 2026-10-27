import { IsNumber, IsOptional, Min } from 'class-validator';

export class CompleteProductionOrderDto {
  // Lo que salió bueno (ADR 0012): puede ser menos que lo planeado por
  // piezas dañadas, y es lo único que entra al inventario. 0 = todo salió
  // dañado. Si se omite, se toma lo planeado (scripts y la API vieja).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  producedQuantity?: number;
}
