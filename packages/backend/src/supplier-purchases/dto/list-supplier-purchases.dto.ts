import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

// Mismo contrato semiabierto [from, to) que DateRangeQueryDto (ver
// common/dto/date-range-query.dto.ts) — declarado aquí en vez de heredado
// porque esta lista también pagina (ListQueryDto), y una clase no puede
// extender dos DTOs a la vez.
export class ListSupplierPurchasesDto extends ListQueryDto {
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
