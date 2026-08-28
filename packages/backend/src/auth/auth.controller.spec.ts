import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  it('delegates to AuthService.login with the DTO email and password', async () => {
    const authService = {
      login: jest.fn().mockResolvedValue({ accessToken: 'token' }),
    };
    const controller = new AuthController(
      authService as unknown as AuthService,
    );

    const result = await controller.login({
      email: 'a@opera.local',
      password: 'password123',
    });

    expect(authService.login).toHaveBeenCalledWith(
      'a@opera.local',
      'password123',
    );
    expect(result).toEqual({ accessToken: 'token' });
  });

  it('delegates to AuthService.forgotPassword and returns a generic message', async () => {
    const authService = {
      forgotPassword: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new AuthController(
      authService as unknown as AuthService,
    );

    const result = await controller.forgotPassword({
      email: 'a@opera.local',
    });

    expect(authService.forgotPassword).toHaveBeenCalledWith('a@opera.local');
    expect(result).toEqual({
      message: 'Si el correo existe, se envió un código de verificación.',
    });
  });

  it('delegates to AuthService.resetPasswordWithCode with email, code and newPassword', async () => {
    const authService = {
      resetPasswordWithCode: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new AuthController(
      authService as unknown as AuthService,
    );

    const result = await controller.resetPassword({
      email: 'a@opera.local',
      code: '123456',
      newPassword: 'New-password-123',
    });

    expect(authService.resetPasswordWithCode).toHaveBeenCalledWith(
      'a@opera.local',
      '123456',
      'New-password-123',
    );
    expect(result).toEqual({ message: 'Contraseña actualizada.' });
  });
});
