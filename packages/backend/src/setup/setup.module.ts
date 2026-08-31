import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

// Importa AuthModule (no un JwtModule propio) para reusar el mismo
// JwtService ya configurado con JWT_SECRET/JWT_EXPIRES_IN -- el token que
// emite este módulo debe ser indistinguible de uno emitido por /auth/login.
@Module({
  imports: [AuthModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
