import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateWarehouseDto {
  @IsOptional()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;
}
