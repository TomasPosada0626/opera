import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class CreateSupplierProductDto {
  @IsUUID('4')
  supplierId: string;

  @IsUUID('4')
  productId: string;

  @IsNumber()
  @IsPositive()
  price: number;
}
