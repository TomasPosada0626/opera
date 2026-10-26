import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsOptional,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class ReceiveLineDto {
  @IsUUID('4')
  itemId: string;

  // Que no supere lo pendiente de la línea lo valida el service (necesita
  // leer lo ya recibido dentro de la transacción).
  @IsPositive()
  quantity: number;
}

export class ReceivePurchaseOrderDto {
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  @ArrayMinSize(1)
  items: ReceiveLineDto[];

  // Cuándo llegó la mercancía, si no fue hoy.
  @IsOptional()
  @IsDateString()
  receivedAt?: string;
}
