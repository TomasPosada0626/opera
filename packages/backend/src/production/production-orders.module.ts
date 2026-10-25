import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductionOrdersService } from './production-orders.service';
import { ProductionOrdersController } from './production-orders.controller';
import { BillOfMaterialsService } from './bill-of-materials.service';
import { BillOfMaterialsController } from './bill-of-materials.controller';

@Module({
  imports: [InventoryModule],
  controllers: [ProductionOrdersController, BillOfMaterialsController],
  providers: [ProductionOrdersService, BillOfMaterialsService],
})
export class ProductionOrdersModule {}
