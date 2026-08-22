import { IsPositive, IsUUID } from 'class-validator';

export class OrderItemDto {
  @IsUUID('4')
  productId: string;

  @IsPositive()
  quantity: number;

  // Precio de venta de esta línea, capturado explícito al crear el pedido —
  // no existe una lista de precios de producto todavía (ver schema.prisma).
  @IsPositive()
  unitPrice: number;
}
