import { IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class CreateExitDto {
  @IsUUID('4')
  productId: string;

  @IsUUID('4')
  warehouseId: string;

  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  location?: string;
}
