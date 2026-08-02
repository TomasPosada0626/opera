import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateWarehouseDto {
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  location?: string;
}
