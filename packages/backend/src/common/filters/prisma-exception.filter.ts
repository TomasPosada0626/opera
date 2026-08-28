import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';

// Antes de este filtro, un duplicado en cualquiera de las 10+ constraints
// @unique del schema (email, SKU, nombre de categoría/unidad, taxId de
// cliente...) caía como 500 sin manejar en cualquier módulo — nadie lo
// traducía a mano por servicio. P2034/P2028 (conflictos de serialización)
// NO se traducen acá a propósito: los pocos services que corren bajo
// Serializable (production/complete, orders/markWarehoused) ya los
// atrapan y traducen ellos mismos, porque el mensaje correcto depende de
// qué operación estaba en curso — para cuando un error llegaría hasta acá,
// ya salió como un ConflictException normal, no como un
// PrismaClientKnownRequestError.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const translated = this.translate(exception);

    if (translated) {
      response.status(translated.getStatus()).json(translated.getResponse());
      return;
    }

    this.logger.error(
      `PrismaClientKnownRequestError sin traducir: ${exception.code} — ${exception.message}`,
    );
    response
      .status(500)
      .json({ statusCode: 500, message: 'Error interno del servidor' });
  }

  private translate(
    exception: Prisma.PrismaClientKnownRequestError,
  ): HttpException | null {
    switch (exception.code) {
      case 'P2002': {
        const target = exception.meta?.target;
        const fields = Array.isArray(target) ? target.join(', ') : 'el campo';
        return new ConflictException(
          `Ya existe un registro con ese valor en ${fields}`,
        );
      }
      case 'P2025':
        return new NotFoundException(
          'El registro no existe o ya fue eliminado',
        );
      case 'P2003': {
        const field = exception.meta?.field_name;
        const fieldLabel = typeof field === 'string' ? field : undefined;
        return new ConflictException(
          fieldLabel
            ? `La operación viola una relación requerida (${fieldLabel})`
            : 'La operación viola una relación requerida',
        );
      }
      case 'P2000':
        return new BadRequestException(
          'Un valor enviado excede el tamaño permitido',
        );
      default:
        return null;
    }
  }
}
