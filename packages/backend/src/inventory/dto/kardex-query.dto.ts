import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class KardexQueryDto extends ListQueryDto {
  // A diferencia de ListQueryDto, el Kardex por defecto muestra lo más
  // reciente primero — no alfabético.
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;
}
