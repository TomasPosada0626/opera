import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { InventoryService } from './inventory.service';
import { CreateEntryDto } from './dto/create-entry.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get(':productId/stock')
  async getStock(@Param('productId') productId: string) {
    await this.inventoryService.assertProductExists(productId);

    const [stock, byWarehouse] = await Promise.all([
      this.inventoryService.getStock(productId),
      this.inventoryService.getStockByWarehouse(productId),
    ]);

    return { productId, stock, byWarehouse };
  }

  @Post('entradas')
  @HttpCode(HttpStatus.CREATED)
  createEntry(@Body() dto: CreateEntryDto, @Req() req: AuthenticatedRequest) {
    return this.inventoryService.createEntry(dto, req.user.sub);
  }
}
