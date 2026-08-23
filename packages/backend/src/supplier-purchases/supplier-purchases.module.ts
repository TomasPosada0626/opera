import { Module } from '@nestjs/common';
import { SupplierPurchasesService } from './supplier-purchases.service';
import { SupplierPurchasesController } from './supplier-purchases.controller';

@Module({
  controllers: [SupplierPurchasesController],
  providers: [SupplierPurchasesService],
})
export class SupplierPurchasesModule {}
