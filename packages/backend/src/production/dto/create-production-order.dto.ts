import { IsPositive, IsUUID } from 'class-validator';

export class CreateProductionOrderDto {
  @IsUUID('4')
  productId: string;

  @IsUUID('4')
  warehouseId: string;

  @IsPositive()
  quantity: number;
}
