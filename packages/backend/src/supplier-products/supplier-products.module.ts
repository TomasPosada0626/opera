import { Module } from '@nestjs/common';
import { SupplierProductsService } from './supplier-products.service';
import { SupplierProductsController } from './supplier-products.controller';

@Module({
  controllers: [SupplierProductsController],
  providers: [SupplierProductsService],
})
export class SupplierProductsModule {}
