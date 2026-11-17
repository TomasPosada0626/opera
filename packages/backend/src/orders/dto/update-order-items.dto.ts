import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { OrderItemDto } from './order-item.dto';

// Una línea de la lista completa del pedido (ADR 0013): con `id` es una
// línea que ya existe (se actualiza su cantidad o su precio; el producto no
// cambia), sin `id` es una línea nueva.
export class UpdateOrderLineDto extends OrderItemDto {
  @IsOptional()
  @IsUUID('4')
  id?: string;
}

// La lista completa de líneas tal como debe quedar el pedido: las que no
// vienen se quitan. Así el formulario manda lo que ve, sin calcular él qué
// cambió.
export class UpdateOrderItemsDto {
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderLineDto)
  @ArrayMinSize(1, { message: 'El pedido debe tener al menos un producto' })
  items: UpdateOrderLineDto[];
}
