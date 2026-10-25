import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class BillOfMaterialsItemDto {
  @IsUUID('4')
  componentId: string;

  // Cuánto de este material lleva UNA unidad del producto terminado, en la
  // unidad del material (kg, m, unidades...).
  @IsPositive()
  quantity: number;
}

// Reemplaza la lista completa (no hay "agregar una línea"): es lo que la
// pantalla edita, y deja una sola forma de que la lista cambie.
export class UpsertBillOfMaterialsDto {
  @ValidateNested({ each: true })
  @Type(() => BillOfMaterialsItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  items: BillOfMaterialsItemDto[];
}
