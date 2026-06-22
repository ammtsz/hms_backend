import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from '../user.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole } from '../../entities/user.entity';
import { Repository } from 'typeorm';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ChangeOwnPasswordDto } from '../../dtos/user.dto';
import {
  passwordChangeMessages,
  PASSWORD_CHANGE_LOCK_DURATION_MINUTES,
} from '../../common/messages/password-change.messages';

// Mock bcrypt
jest.mock('bcrypt');

describe('UserService - Password Change Rate Limiting', () => {
  let service: UserService;
  let repository: Repository<User>;

  const mockUser: Partial<User> = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    displayName: 'Test',
    role: UserRole.STAFF,
    isActive: true,
    mustChangePassword: true,
    passwordHash: 'hashed_password',
    failedLoginAttempts: 0,
    lockedUntil: null,
    failedPasswordChangeAttempts: 0,
    passwordChangeLockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    isLocked: jest.fn().mockReturnValue(false),
    isPasswordChangeLocked: jest.fn().mockReturnValue(false),
  };

  const mockRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));

    // Reset mocks
    jest.clearAllMocks();
    (bcrypt.compare as jest.Mock).mockReset();
    (bcrypt.hash as jest.Mock).mockResolvedValue('new_hashed_password');
  });

  describe('changeOwnPassword - Rate Limiting', () => {
    it('should successfully change password on first attempt', async () => {
      const changePasswordDto: ChangeOwnPasswordDto = {
        current_password: 'OldPassword123',
        new_password: 'NewValidPassword123',
      };

      mockRepository.findOne.mockResolvedValue({ ...mockUser });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.changeOwnPassword(1, changePasswordDto);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedPasswordChangeAttempts: 0,
          passwordChangeLockedUntil: null,
          mustChangePassword: false,
        })
      );
    });

    it('should increment failed attempts on wrong password', async () => {
      const changePasswordDto: ChangeOwnPasswordDto = {
        current_password: 'WrongPassword123',
        new_password: 'NewValidPassword123',
      };

      const user = { ...mockUser, failedPasswordChangeAttempts: 0 };
      mockRepository.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changeOwnPassword(1, changePasswordDto)
      ).rejects.toThrow(UnauthorizedException);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedPasswordChangeAttempts: 1,
        })
      );
    });

    it('should show remaining attempts after failed password', async () => {
      const changePasswordDto: ChangeOwnPasswordDto = {
        current_password: 'WrongPassword123',
        new_password: 'NewValidPassword123',
      };

      const user = { ...mockUser, failedPasswordChangeAttempts: 2 };
      mockRepository.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changeOwnPassword(1, changePasswordDto)
      ).rejects.toThrow(passwordChangeMessages.incorrectWithRemaining(2));

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedPasswordChangeAttempts: 3,
        })
      );
    });

    it('should lock account after 5 failed attempts', async () => {
      const changePasswordDto: ChangeOwnPasswordDto = {
        current_password: 'WrongPassword123',
        new_password: 'NewValidPassword123',
      };

      const user = { ...mockUser, failedPasswordChangeAttempts: 4 };
      mockRepository.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changeOwnPassword(1, changePasswordDto)
      ).rejects.toThrow(
        passwordChangeMessages.accountLocked(PASSWORD_CHANGE_LOCK_DURATION_MINUTES),
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedPasswordChangeAttempts: 5,
          passwordChangeLockedUntil: expect.any(Date),
        })
      );
    });

    it('should prevent password change when locked', async () => {
      const changePasswordDto: ChangeOwnPasswordDto = {
        current_password: 'CorrectPassword123',
        new_password: 'NewValidPassword123',
      };

      const lockTime = new Date(Date.now() + 10 * 60 * 1000); // Locked for 10 more minutes
      const user = {
        ...mockUser,
        failedPasswordChangeAttempts: 5,
        passwordChangeLockedUntil: lockTime,
        isPasswordChangeLocked: jest.fn().mockReturnValue(true),
      };

      mockRepository.findOne.mockResolvedValue(user);

      await expect(
        service.changeOwnPassword(1, changePasswordDto)
      ).rejects.toThrow(/Too many failed password change attempts/);
    });

    it('should allow password change after lock expires', async () => {
      const changePasswordDto: ChangeOwnPasswordDto = {
        current_password: 'CorrectPassword123',
        new_password: 'NewValidPassword123',
      };

      const expiredLockTime = new Date(Date.now() - 1000); // Lock expired
      const user = {
        ...mockUser,
        failedPasswordChangeAttempts: 5,
        passwordChangeLockedUntil: expiredLockTime,
        isPasswordChangeLocked: jest.fn().mockReturnValue(false),
      };

      mockRepository.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.changeOwnPassword(1, changePasswordDto);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedPasswordChangeAttempts: 0,
          passwordChangeLockedUntil: null,
        })
      );
    });

    it('should reset failed attempts on successful password change', async () => {
      const changePasswordDto: ChangeOwnPasswordDto = {
        current_password: 'CorrectPassword123',
        new_password: 'NewValidPassword123',
      };

      const user = { ...mockUser, failedPasswordChangeAttempts: 3 };
      mockRepository.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.changeOwnPassword(1, changePasswordDto);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedPasswordChangeAttempts: 0,
          passwordChangeLockedUntil: null,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
      );
    });

    it('should validate new password meets requirements', async () => {
      const changePasswordDto: ChangeOwnPasswordDto = {
        current_password: 'CorrectPassword123',
        new_password: 'short', // Too short
      };

      mockRepository.findOne.mockResolvedValue({ ...mockUser });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.changeOwnPassword(1, changePasswordDto)
      ).rejects.toThrow(BadRequestException);
    });

    it('should track multiple users independently', async () => {
      const changePasswordDto: ChangeOwnPasswordDto = {
        current_password: 'WrongPassword123',
        new_password: 'NewValidPassword123',
      };

      // User 1 with 2 failed attempts
      const user1 = { ...mockUser, id: 1, failedPasswordChangeAttempts: 2 };
      mockRepository.findOne.mockResolvedValueOnce(user1);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changeOwnPassword(1, changePasswordDto)
      ).rejects.toThrow(passwordChangeMessages.incorrectWithRemaining(2));

      // User 2 with 0 failed attempts
      const user2 = { ...mockUser, id: 2, failedPasswordChangeAttempts: 0 };
      mockRepository.findOne.mockResolvedValueOnce(user2);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changeOwnPassword(2, changePasswordDto)
      ).rejects.toThrow(passwordChangeMessages.incorrectWithRemaining(4));
    });
  });
});
