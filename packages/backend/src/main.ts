import './config/env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Permisivo a propósito: el cliente de escritorio llama a esta API desde
  // http://localhost:5173 en dev y file:// una vez empaquetado — ninguno de
  // los dos es un origen fijo que se pueda listar de antemano. La auth es
  // por header Authorization (JWT), no por cookie, así que no hay superficie
  // de CSRF que un CORS abierto empeore: un origen ajeno no puede leer el
  // token de localStorage ni adjuntarlo sin que el usuario ya se lo diera.
  app.enableCors();

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

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
