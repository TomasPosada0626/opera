import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });

    if (
      !user ||
      !user.isActive ||
      !(await argon2.verify(user.password, password))
    ) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles.map(({ role }) => role.name),
    };

    return { accessToken: await this.jwtService.signAsync(payload) };
  }
}
