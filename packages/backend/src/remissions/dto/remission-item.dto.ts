import { IsPositive, IsUUID } from 'class-validator';

export class RemissionItemDto {
  @IsUUID('4')
  orderItemId: string;

  @IsPositive()
  quantity: number;
}
