import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_ONLY_MESSAGE, DATE_ONLY_PATTERN } from './create-order.dto';

// Solo los datos de seguimiento son editables — las líneas, el cliente y la
// bodega no, porque ya pueden tener stock y remisiones atados. `null`
// borra el valor; omitir el campo lo deja como está.
export class UpdateOrderDto {
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: DATE_ONLY_MESSAGE })
  @IsDateString({}, { message: DATE_ONLY_MESSAGE })
  estimatedDeliveryDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
