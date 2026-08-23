import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { RemissionsService } from './remissions.service';
import { RemissionsController } from './remissions.controller';

@Module({
  imports: [InventoryModule],
  controllers: [RemissionsController],
  providers: [RemissionsService],
})
export class RemissionsModule {}
