import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { RemissionPaymentStatus } from '@prisma/client';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class ListRemissionsDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(RemissionPaymentStatus)
  paymentStatus?: RemissionPaymentStatus;

  @IsOptional()
  @IsUUID('4')
  customerId?: string;
}
