import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { DateRangeQueryDto } from '../../common/dto/date-range-query.dto';

export class AuditQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsString()
  entity?: string;

  // entityId/userId son siempre el id (uuid v4) de la entidad de negocio o
  // del usuario que hizo el cambio — antes @IsString() aceptaba cualquier
  // texto y dejaba pasar un id mal formado hasta la propia consulta a
  // Postgres (señalado en la re-auditoría).
  @IsOptional()
  @IsUUID('4')
  entityId?: string;

  @IsOptional()
  @IsUUID('4')
  userId?: string;

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
}
