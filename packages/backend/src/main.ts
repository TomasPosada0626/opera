import './config/env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

// Únicos dos orígenes reales desde los que el cliente de escritorio llama a
// esta API: Vite en dev, y el renderer empaquetado cargado desde file://
// (que el navegador reporta como el string literal "null", no ausente).
// La auth va por header Authorization (JWT), no por cookie, así que no hay
// superficie de CSRF — esta lista solo evita que una página arbitraria de
// la LAN pueda leer respuestas de la API vía JS desde su propio origen.
const ALLOWED_ORIGINS = ['http://localhost:5173', 'null'];

async function bootstrap() {
  // bufferLogs: nada se pierde entre que Nest arranca y LoggerModule queda
  // listo — sin esto, cualquier log de un módulo que se instancia temprano
  // (ej. PrismaService.onModuleInit) se perdería en silencio.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // Vía ConfigService (no process.env directo) para que los .default() del
  // Joi schema en app.module.ts sean el único lugar donde vive cada default
  // — antes PORT/SWAGGER_ENABLED se leían crudo acá, duplicando (y
  // arriesgando desincronizar) el default que Joi ya declara.
  const configService = app.get(ConfigService);

  // Nada capturaba esto antes — un fallo fuera del ciclo normal de
  // request/response (una promesa sin `await`, un error asíncrono suelto)
  // se perdía sin dejar rastro. Ahora al menos queda en el log rotado.
  //
  // Deuda conocida, aceptada por ahora (auditoría 2026-09-03, ronda 3): ni
  // uncaughtException ni unhandledRejection terminan el proceso tras
  // loguear -- Node recomienda no seguir operando después de una excepción
  // no capturada, porque el estado de la app ya no está garantizado. No se
  // agregó `process.exit()` en esta pasada porque cambia el comportamiento
  // de crash de todo el backend (una sola promesa suelta en un request
  // tumbaría el servidor completo para el resto de quien lo esté usando en
  // ese momento) y merece evaluarse aparte, con el flujo de reinicio de
  // backend-manager.ts (que sí sabe reportar y reintentar un backend
  // empaquetado que murió inesperado) en mente antes de decidir.
  const logger = app.get(Logger);
  process.on('uncaughtException', (error) => {
    logger.error(error, 'uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(reason, 'unhandledRejection');
  });

  // forbidNonWhitelisted (no solo whitelist): un campo desconocido en el body
  // ahora es un 400 explícito en vez de descartarse en silencio — antes un
  // bug de cliente (o un probing) que mandara props de más pasaba
  // inadvertido.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.use(helmet());
  app.enableCors({ origin: ALLOWED_ORIGINS });
  // Sin esto, Nest nunca escucha SIGTERM/SIGINT ni corre onModuleDestroy()
  // -- el SIGTERM que backend-manager.ts manda al cerrar Opera mataba el
  // proceso en seco, sin que PrismaService.onModuleDestroy() llegara a
  // cerrar el pool de conexiones (auditoría 2026-09-01, ronda 2).
  app.enableShutdownHooks();

  // Apagado por defecto: solo se monta si SWAGGER_ENABLED=true en .env
  // (conveniencia de desarrollo local, nunca en un despliegue real de LAN).
  if (configService.get<string>('SWAGGER_ENABLED') === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Opera API')
      .setDescription(
        'API REST del ERP de escritorio Opera (inventario, producción, compras, ventas)',
      )
      .setVersion('0.0.1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(configService.get<number>('PORT') ?? 3000);
}
void bootstrap();
