import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_ONLY_MESSAGE, DATE_ONLY_PATTERN } from './create-order.dto';
import { VAT_RATES } from '../vat';

// Los datos de seguimiento — el cliente y la bodega no se editan, porque ya
// pueden tener stock y remisiones atados, y las líneas van por su propio
// endpoint (UpdateOrderItemsDto, ADR 0013). `null` borra el valor; omitir
// el campo lo deja como está. El IVA también, mientras el pedido no tenga
// remisiones vigentes (ver OrdersService).
export class UpdateOrderDto {
  @IsOptional()
  @IsIn(VAT_RATES, { message: 'El IVA debe ser 0 (sin IVA) o 19' })
  vatRate?: number;

  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_ONLY_MESSAGE })
  @IsDateString({}, { message: DATE_ONLY_MESSAGE })
  estimatedDeliveryDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
