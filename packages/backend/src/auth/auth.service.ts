import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { toRolesAndPermissions } from './roles-permissions.util';
import { HASH_OPTIONS } from './argon2-options';

// Hash señuelo, sin usuario real detrás — se computa una sola vez (argon2id
// es deliberadamente lento) y se cachea. Verificar contra esto cuando el
// email no existe hace que argon2.verify() corra con el mismo costo que un
// intento real, así el tiempo de respuesta no delata si un email está o no
// registrado (timing oracle real, señalado en la auditoría de seguridad:
// antes, `!user || ...` hacía short-circuit y nunca llamaba argon2.verify
// para un email inexistente, respondiendo notablemente más rápido).
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= argon2.hash('opera-timing-oracle-mitigation', HASH_OPTIONS);
  return dummyHash;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    const hashToCheck = user ? user.password : await getDummyHash();
    const passwordMatches = await argon2.verify(hashToCheck, password);

    if (!user || !user.isActive || !passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const { roles, permissions } = toRolesAndPermissions(user);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles,
      permissions,
    };

    return { accessToken: await this.jwtService.signAsync(payload) };
  }
}
