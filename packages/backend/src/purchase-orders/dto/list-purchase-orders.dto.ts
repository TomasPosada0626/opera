import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PurchaseOrderStatus } from '@prisma/client';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class ListPurchaseOrdersDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  // Pendientes de recibir: PENDIENTE o PARCIAL.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  open?: boolean;
}
