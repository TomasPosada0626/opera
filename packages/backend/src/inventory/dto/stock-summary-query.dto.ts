import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class StockSummaryQueryDto {
  // Llega como "id1,id2,id3" en la query string — no hay forma de mandar un
  // array real en un GET sin body.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @IsUUID('4', { each: true })
  productIds: string[];

  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;
}
