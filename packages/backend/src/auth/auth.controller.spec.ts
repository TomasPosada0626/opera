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
});
