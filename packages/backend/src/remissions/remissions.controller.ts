import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, type Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { RemissionsService } from './remissions.service';
import { CreateRemissionDto } from './dto/create-remission.dto';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('remissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('remissions')
export class RemissionsController {
  constructor(private readonly remissionsService: RemissionsService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateRemissionDto, @Req() req: AuthenticatedRequest) {
    return this.remissionsService.create(dto, req.user.sub);
  }

  @Get()
  findAll(@Query() query: ListQueryDto) {
    return this.remissionsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.remissionsService.findOne(id);
  }

  // @Res() de Express directo (no el flujo normal de retorno de Nest) — el
  // PDF es contenido binario con sus propios headers, no un JSON que el
  // interceptor de serialización de Nest deba tocar.
  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, number } = await this.remissionsService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="remision-${number}.pdf"`,
    });
    res.send(buffer);
  }
}
