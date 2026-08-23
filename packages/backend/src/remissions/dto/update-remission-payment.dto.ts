import { IsEnum, IsOptional, IsPositive } from 'class-validator';
import { RemissionPaymentStatus } from '@prisma/client';

export class UpdateRemissionPaymentDto {
  @IsEnum(RemissionPaymentStatus)
  paymentStatus: RemissionPaymentStatus;

  @IsOptional()
  @IsPositive()
  amountPaid?: number;
}
