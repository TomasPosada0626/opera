import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsOptional,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { RemissionPaymentStatus } from '@prisma/client';
import { RemissionItemDto } from './remission-item.dto';

export class CreateRemissionDto {
  @IsUUID('4')
  orderId: string;

  @IsEnum(RemissionPaymentStatus)
  paymentStatus: RemissionPaymentStatus;

  // Solo tiene sentido con paymentStatus = ABONADO — cuánto de esta
  // remisión ya se pagó, no el saldo total del cliente.
  @IsOptional()
  @IsPositive()
  amountPaid?: number;

  @ValidateNested({ each: true })
  @Type(() => RemissionItemDto)
  @ArrayMinSize(1)
  items: RemissionItemDto[];
}
