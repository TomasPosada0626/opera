import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductionOrdersService } from './production-orders.service';
import { ProductionOrdersController } from './production-orders.controller';

@Module({
  imports: [InventoryModule],
  controllers: [ProductionOrdersController],
  providers: [ProductionOrdersService],
})
export class ProductionOrdersModule {}
