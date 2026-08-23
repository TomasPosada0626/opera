import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ProductType } from '@prisma/client';

export class UpdateProductDto {
  @IsOptional()
  @MinLength(1)
  @MaxLength(50)
  sku?: string;

  @IsOptional()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsOptional()
  @IsNumber()
  minStock?: number;

  @IsOptional()
  @IsNumber()
  maxStock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  finish?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  material?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  size?: string;
}
