import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  MinLength,
} from 'class-validator';
import { ProductType } from '@prisma/client';

export class CreateProductDto {
  @MinLength(1)
  sku: string;

  @MinLength(2)
  name: string;

  @IsEnum(ProductType)
  type: ProductType;

  @IsUUID('4')
  categoryId: string;

  @IsUUID('4')
  unitId: string;

  @IsOptional()
  @IsNumber()
  minStock?: number;

  @IsOptional()
  @IsNumber()
  maxStock?: number;
}
