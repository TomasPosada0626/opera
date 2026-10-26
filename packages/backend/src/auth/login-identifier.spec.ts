import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { isLoginIdentifier } from './login-identifier';
import { LoginDto } from './dto/login.dto';
import { CreateAdminDto } from '../setup/dto/create-admin.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';

describe('login identifier', () => {
  it.each([
    'herrajestoro',
    'herrajestoro2',
    'ana.maria',
    'bodega_1',
    'admin@opera.local',
  ])('accepts %s', (value) => {
    expect(isLoginIdentifier(value)).toBe(true);
  });

  it.each([
    '',
    'ab',
    'con espacio',
    '.empieza-con-punto',
    'ñandú',
    'a'.repeat(51),
    42,
    null,
  ])('rejects %p', (value) => {
    expect(isLoginIdentifier(value)).toBe(false);
  });

  it('lets a user log in with a username, in any case and with stray spaces', async () => {
    const dto = plainToInstance(LoginDto, {
      email: '  HerrajesToro ',
      password: 'Angel-de-prueba-1',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('herrajestoro');
  });

  it('creates the first admin and other users with a username', async () => {
    const admin = plainToInstance(CreateAdminDto, {
      email: 'herrajestoro',
      password: 'Angel-de-prueba-1',
      name: 'Herrajes Toro',
    });
    const backup = plainToInstance(CreateUserDto, {
      email: 'HerrajesToro2',
      password: 'Angel-de-prueba-1',
      name: 'Respaldo',
    });

    expect(await validate(admin)).toHaveLength(0);
    expect(await validate(backup)).toHaveLength(0);
    expect(backup.email).toBe('herrajestoro2');
  });

  it('explains what is allowed when the identifier is invalid', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'con espacio',
      password: 'Angel-de-prueba-1',
    });

    const [error] = await validate(dto);
    expect(error.constraints?.isLoginIdentifier).toMatch(
      /correo o un nombre de usuario/,
    );
  });

  it('still requires a real email to send a reset code by mail', async () => {
    const dto = plainToInstance(ForgotPasswordDto, { email: 'herrajestoro' });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
