import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SearchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  q: string;

  // Por categoría, no total — 5 productos + 5 clientes + ... no compite con
  // 5 resultados repartidos entre todas las categorías (algunas quedarían
  // sin representar si el término coincide más con una que con otras).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 5;
}
