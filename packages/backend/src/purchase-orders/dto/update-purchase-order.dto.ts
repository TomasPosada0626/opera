import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../orders/dto/create-order.dto';
import { EXPECTED_DATE_MESSAGE } from './create-purchase-order.dto';

// Solo los datos de seguimiento: las líneas y los costos no se editan
// después de crear la compra (los recibos ya escritos dependen de ellos).
// `null` borra el dato.
export class UpdatePurchaseOrderDto {
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: EXPECTED_DATE_MESSAGE })
  @IsDateString({}, { message: EXPECTED_DATE_MESSAGE })
  expectedDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierInvoice?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
