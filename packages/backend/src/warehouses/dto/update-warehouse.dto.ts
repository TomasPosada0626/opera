import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateWarehouseDto {
  @IsOptional()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  location?: string;
}
