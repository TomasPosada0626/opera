import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateSupplierDto {
  @IsOptional()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
