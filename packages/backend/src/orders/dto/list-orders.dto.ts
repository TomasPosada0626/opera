import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class ListOrdersDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  // ?overdue=true: con fecha de envío estimada ya vencida y todavía sin
  // despachar ni cancelar (ver OrdersService.overdueWhere).
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  overdue?: boolean;
}
