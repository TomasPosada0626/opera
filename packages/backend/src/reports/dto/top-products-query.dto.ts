import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DateRangeQueryDto } from './date-range-query.dto';

export class TopProductsQueryDto extends DateRangeQueryDto {
  // 'desc' (default) = más vendidos, 'asc' = menos vendidos — el mismo
  // reporte sirve para ambos extremos del ranking que pidió el usuario
  // para el Dashboard (ver nota de visión M5), no dos endpoints separados.
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
