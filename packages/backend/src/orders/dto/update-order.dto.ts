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

// Solo los datos de seguimiento son editables — las líneas, el cliente y la
// bodega no, porque ya pueden tener stock y remisiones atados. `null`
// borra el valor; omitir el campo lo deja como está. El IVA también,
// mientras el pedido no tenga remisiones vigentes (ver OrdersService).
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
