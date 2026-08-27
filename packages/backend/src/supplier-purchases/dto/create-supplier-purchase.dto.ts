import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
} from 'class-validator';

export class CreateSupplierPurchaseDto {
  @IsUUID('4')
  supplierId: string;

  @IsUUID('4')
  productId: string;

  // Requerida para toda compra nueva (#104-purchases) — sin bodega, no hay
  // dónde recibirla después. Los registros anteriores a este campo quedan
  // con warehouseId null y simplemente no se pueden marcar como recibidos.
  @IsUUID('4')
  warehouseId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @IsPositive()
  unitCost: number;

  // Opcional porque una compra puede registrarse días después de que
  // ocurrió — si no viene, el modelo la marca "ahora" (ver schema.prisma).
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;
}
