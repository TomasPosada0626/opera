import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class ListOrdersDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsUUID('4')
  customerId?: string;
}
