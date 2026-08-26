import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ReportsModule } from '../reports/reports.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [InventoryModule, ReportsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
