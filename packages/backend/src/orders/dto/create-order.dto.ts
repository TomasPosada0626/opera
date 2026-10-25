import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { OrderItemDto } from './order-item.dto';

// Solo "AAAA-MM-DD", sin hora: la fecha de envío se guarda como DATE (ver
// Order.estimatedDeliveryDate en schema.prisma) y una hora con zona podría
// correrla un día al convertirse.
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const DATE_ONLY_MESSAGE =
  'La fecha de envío estimada debe tener el formato AAAA-MM-DD';

export class CreateOrderDto {
  @IsUUID('4')
  customerId: string;

  @IsUUID('4')
  warehouseId: string;

  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @ArrayMinSize(1)
  items: OrderItemDto[];

  // Opcional en la API (scripts, fixtures, pedidos viejos); el formulario
  // de escritorio la exige.
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_ONLY_MESSAGE })
  @IsDateString({}, { message: DATE_ONLY_MESSAGE })
  estimatedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
