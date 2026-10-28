import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string;

  // Sin valor por defecto acá a propósito: con `transform: true` un default
  // de clase se aplicaba antes que el del servicio y pisaba el 'desc' de las
  // listas que deben salir de la más reciente a la más vieja (pedidos,
  // producción, remisiones…). Cada servicio pone el suyo al desestructurar.
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsString()
  search?: string;
}
