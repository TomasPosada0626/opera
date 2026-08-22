import { Type } from 'class-transformer';
import { ArrayMinSize, IsUUID, ValidateNested } from 'class-validator';
import { OrderItemDto } from './order-item.dto';

export class CreateOrderDto {
  @IsUUID('4')
  customerId: string;

  @IsUUID('4')
  warehouseId: string;

  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @ArrayMinSize(1)
  items: OrderItemDto[];
}
