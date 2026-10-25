import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { RemissionItemDto } from './remission-item.dto';
import { CreatePaymentDto } from './create-payment.dto';

export class CreateRemissionDto {
  @IsUUID('4')
  orderId: string;

  @ValidateNested({ each: true })
  @Type(() => RemissionItemDto)
  @ArrayMinSize(1)
  items: RemissionItemDto[];

  // Lo que el cliente pagó en el momento del despacho, si pagó algo. El
  // estado de pago (pagado/abonado/cartera) ya no se elige: se calcula de
  // los abonos contra el total de la remisión.
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePaymentDto)
  initialPayment?: CreatePaymentDto;
}
