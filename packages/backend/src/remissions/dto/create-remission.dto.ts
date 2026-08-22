import { Type } from 'class-transformer';
import { ArrayMinSize, IsUUID, ValidateNested } from 'class-validator';
import { RemissionItemDto } from './remission-item.dto';

export class CreateRemissionDto {
  @IsUUID('4')
  orderId: string;

  @ValidateNested({ each: true })
  @Type(() => RemissionItemDto)
  @ArrayMinSize(1)
  items: RemissionItemDto[];
}
