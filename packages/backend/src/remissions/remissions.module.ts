import { Module } from '@nestjs/common';
import { RemissionsService } from './remissions.service';
import { RemissionsController } from './remissions.controller';

@Module({
  controllers: [RemissionsController],
  providers: [RemissionsService],
})
export class RemissionsModule {}
