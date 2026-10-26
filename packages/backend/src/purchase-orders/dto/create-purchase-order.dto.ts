import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreatePaymentDto } from '../../remissions/dto/create-payment.dto';
import { DATE_ONLY_PATTERN } from '../../orders/dto/create-order.dto';

export const EXPECTED_DATE_MESSAGE =
  'La fecha esperada debe tener el formato AAAA-MM-DD';

export class PurchaseOrderItemDto {
  @IsUUID('4')
  productId: string;

  @IsPositive()
  quantity: number;

  // Puede ser 0 (una muestra o un obsequio del proveedor), nunca negativo.
  @IsNumber()
  @Min(0)
  unitCost: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID('4')
  supplierId: string;

  @IsUUID('4')
  warehouseId: string;

  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  @ArrayMinSize(1)
  items: PurchaseOrderItemDto[];

  // Cuándo se hizo la compra, si no fue hoy.
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: EXPECTED_DATE_MESSAGE })
  @IsDateString({}, { message: EXPECTED_DATE_MESSAGE })
  expectedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierInvoice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Anticipo al proveedor en el mismo paso de registrar la compra.
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePaymentDto)
  initialPayment?: CreatePaymentDto;
}
