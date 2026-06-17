import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from '../auth.controller';
import { AuthService } from '../../services/auth.service';
import { BffSecretGuard } from '../../common/guards/bff-secret.guard';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: jest.fn(),
    register: jest.fn(),
    refreshTokens: jest.fn(),
    logout: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(BffSecretGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('refresh', () => {
    it('returns both tokens in JSON for the BFF to set cookies', async () => {
      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const mockRes = { cookie: jest.fn() };
      const req = {
        cookies: { refresh_token: 'old-refresh-token' },
        res: mockRes,
      };

      const result = await controller.refresh(req);

      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith('old-refresh-token');
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
      expect(mockRes.cookie).not.toHaveBeenCalled();
    });

    it('throws when refresh_token cookie is missing', async () => {
      await expect(controller.refresh({ cookies: {} })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes refresh token without clearing cookies (BFF owns browser cookies)', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const mockRes = { clearCookie: jest.fn() };
      const req = {
        cookies: { refresh_token: 'refresh-token' },
        res: mockRes,
      };

      const result = await controller.logout(req);

      expect(mockAuthService.logout).toHaveBeenCalledWith('refresh-token');
      expect(result).toEqual({ message: 'Logout successful' });
      expect(mockRes.clearCookie).not.toHaveBeenCalled();
    });

    it('succeeds when no refresh token cookie is present', async () => {
      const result = await controller.logout({ cookies: {} });

      expect(result).toEqual({ message: 'Logout successful' });
      expect(mockAuthService.logout).not.toHaveBeenCalled();
    });
  });
});
