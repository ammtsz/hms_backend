import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from '../auth.service';
import { User } from '../../entities/user.entity';
import { RefreshToken } from '../../entities/refresh-token.entity';
import * as bcrypt from 'bcrypt';

describe('AuthService - Security Features', () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let jwtService: JwtService;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    passwordHash: 'hashedpassword',
    name: 'Test User',
    isActive: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    isLocked: function() {
      return this.lockedUntil && this.lockedUntil > new Date();
    },
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockRefreshTokenRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    }),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    jwtService = module.get<JwtService>(JwtService);

    jest.clearAllMocks();
  });

  describe('Account Lockout', () => {
    it('should increment failed login attempts on incorrect password', async () => {
      const user = { ...mockUser, failedLoginAttempts: 0 };
      mockUserRepository.findOne.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 1,
        }),
      );
    });

    it('should lock account after 5 failed login attempts', async () => {
      const user = { ...mockUser, failedLoginAttempts: 4 };
      mockUserRepository.findOne.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow('Conta bloqueada por 15 minutos');

      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        }),
      );
    });

    it('should reject login for locked account', async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      const user = {
        ...mockUser,
        failedLoginAttempts: 5,
        lockedUntil,
        isLocked: function() {
          return this.lockedUntil > new Date();
        },
      };
      mockUserRepository.findOne.mockResolvedValue(user);

      await expect(
        service.login({ email: 'test@example.com', password: 'correctpassword' }),
      ).rejects.toThrow(/Conta bloqueada/);

      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should reset failed attempts on successful login', async () => {
      const user = {
        ...mockUser,
        failedLoginAttempts: 3,
        passwordHash: await bcrypt.hash('correctpassword', 10),
      };
      mockUserRepository.findOne.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      await service.login({ email: 'test@example.com', password: 'correctpassword' });

      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 0,
          lockedUntil: null,
        }),
      );
    });
  });

  describe('Timing-Safe Validation', () => {
    it('should perform bcrypt comparison even for non-existent users', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      const bcryptSpy = jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      const result = await service.validateUser('nonexistent@example.com', 'password');

      expect(result).toBeNull();
      expect(bcryptSpy).toHaveBeenCalled();
    });

    it('should use dummy hash when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      const bcryptSpy = jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await service.validateUser('nonexistent@example.com', 'password');

      expect(bcryptSpy).toHaveBeenCalledWith(
        'password',
        expect.stringContaining('$2b$10$'),
      );
    });

    it('should take similar time for valid and invalid emails', async () => {
      // Mock non-existent user
      mockUserRepository.findOne.mockResolvedValue(null);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      const start1 = Date.now();
      await service.validateUser('nonexistent@example.com', 'password');
      const duration1 = Date.now() - start1;

      // Mock existing user with wrong password
      const user = {
        ...mockUser,
        passwordHash: await bcrypt.hash('correctpassword', 10),
      };
      mockUserRepository.findOne.mockResolvedValue(user);

      const start2 = Date.now();
      await service.validateUser('test@example.com', 'wrongpassword');
      const duration2 = Date.now() - start2;

      // Timings should be within reasonable range (allowing for random delay)
      expect(Math.abs(duration1 - duration2)).toBeLessThan(200);
    });
  });

  describe('Input Sanitization', () => {
    it('should handle email with special characters', async () => {
      const user = {
        ...mockUser,
        email: "test'<script>alert('xss')</script>@example.com",
      };
      mockUserRepository.findOne.mockResolvedValue(user);

      // Should not throw, just fail validation
      await expect(
        service.login({
          email: "test'<script>alert('xss')</script>@example.com",
          password: 'password',
        }),
      ).rejects.toThrow();
    });
  });
});
