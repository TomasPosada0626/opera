import './config/env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

// Únicos dos orígenes reales desde los que el cliente de escritorio llama a
// esta API: Vite en dev, y el renderer empaquetado cargado desde file://
// (que el navegador reporta como el string literal "null", no ausente).
// La auth va por header Authorization (JWT), no por cookie, así que no hay
// superficie de CSRF — esta lista solo evita que una página arbitraria de
// la LAN pueda leer respuestas de la API vía JS desde su propio origen.
const ALLOWED_ORIGINS = ['http://localhost:5173', 'null'];

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

  // Apagado por defecto: solo se monta si SWAGGER_ENABLED=true en .env
  // (conveniencia de desarrollo local, nunca en un despliegue real de LAN).
  if (process.env.SWAGGER_ENABLED === 'true') {
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

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
