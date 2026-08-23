import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ProductType } from '@prisma/client';

export class CreateProductDto {
  @MinLength(1)
  @MaxLength(50)
  sku: string;

  @MinLength(2)
  @MaxLength(200)
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
