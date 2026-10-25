import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  // Que no supere el saldo pendiente de la remisión lo valida el service
  // (necesita leer lo ya abonado dentro de la transacción).
  @IsPositive()
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  // Cuándo pagó el cliente, si no fue hoy (p. ej. una transferencia que
  // llegó el viernes y se registra el lunes). Sin esto, se usa ahora.
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
