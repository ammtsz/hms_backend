import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateOwnProfileDto,
  ResetPasswordDto,
  ChangeOwnPasswordDto,
  UserListResponseDto,
} from '../dtos/user.dto';
import { UserResponseDto } from '../dtos/auth.dto';
import { validatePassword } from '../common/validators/password.validator';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Create new user (admin only)
   */
  async createUser(createUserDto: CreateUserDto): Promise<UserListResponseDto> {
    const { email, password, must_change_password, ...userData } = createUserDto;

    // Check if email already exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    // Validate password
    const validation = validatePassword(password);
    if (!validation.isValid) {
      throw new BadRequestException(validation.errors.join(', '));
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = this.userRepository.create({
      email,
      passwordHash,
      ...userData,
      mustChangePassword: must_change_password ?? true, // Default to true for new users
    });

    const savedUser = await this.userRepository.save(user);
    return UserListResponseDto.fromEntity(savedUser);
  }

  /**
   * Get all users (admin only)
   */
  async findAll(): Promise<UserListResponseDto[]> {
    const users = await this.userRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });

    return users.map((user) => UserListResponseDto.fromEntity(user));
  }

  /**
   * Get user by ID
   */
  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Update user (admin only)
   */
  async updateUser(
    id: number,
    updateUserDto: UpdateUserDto,
  ): Promise<UserListResponseDto> {
    const user = await this.findOne(id);

    // Check if email is being changed and if it's already in use
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    }

    // Update fields
    Object.assign(user, {
      name: updateUserDto.name ?? user.name,
      email: updateUserDto.email ?? user.email,
      displayName: updateUserDto.display_name ?? user.displayName,
      role: updateUserDto.role ?? user.role,
      isActive: updateUserDto.is_active ?? user.isActive,
    });

    const updatedUser = await this.userRepository.save(user);
    return UserListResponseDto.fromEntity(updatedUser);
  }

  /**
   * Delete user permanently (admin only)
   */
  async deleteUser(id: number): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }

  /**
   * Deactivate user (soft delete) (admin only)
   */
  async deactivateUser(id: number): Promise<UserListResponseDto> {
    const user = await this.findOne(id);
    user.isActive = false;
    const updatedUser = await this.userRepository.save(user);
    return UserListResponseDto.fromEntity(updatedUser);
  }

  /**
   * Reactivate user (admin only)
   */
  async reactivateUser(id: number): Promise<UserListResponseDto> {
    const user = await this.findOne(id);
    user.isActive = true;
    const updatedUser = await this.userRepository.save(user);
    return UserListResponseDto.fromEntity(updatedUser);
  }

  /**
   * Reset user password (admin only)
   */
  async resetUserPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    const { user_id, new_password, must_change_password } = resetPasswordDto;

    const user = await this.findOne(user_id);

    // Validate new password
    const validation = validatePassword(new_password);
    if (!validation.isValid) {
      throw new BadRequestException(validation.errors.join(', '));
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(new_password, 10);

    // Update password and force change flag
    user.passwordHash = passwordHash;
    user.mustChangePassword = must_change_password;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;

    await this.userRepository.save(user);
  }

  /**
   * Update own profile (any authenticated user)
   */
  async updateOwnProfile(
    userId: number,
    updateOwnProfileDto: UpdateOwnProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.findOne(userId);

    // Admin users can update their own name and email
    if (user.role === 'admin') {
      if (updateOwnProfileDto.name !== undefined) {
        user.name = updateOwnProfileDto.name;
      }

      if (updateOwnProfileDto.email !== undefined) {
        // Check if email is already in use by another user
        const existingUser = await this.userRepository.findOne({
          where: { email: updateOwnProfileDto.email },
        });

        if (existingUser && existingUser.id !== userId) {
          throw new BadRequestException('Email is already in use');
        }

        user.email = updateOwnProfileDto.email;
      }
    }

    // Update display name if provided
    if (updateOwnProfileDto.display_name !== undefined) {
      user.displayName = updateOwnProfileDto.display_name;
    }

    // Handle password change if provided
    if (updateOwnProfileDto.new_password) {
      if (!updateOwnProfileDto.current_password) {
        throw new BadRequestException(
          'Current password is required to change password',
        );
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(
        updateOwnProfileDto.current_password,
        user.passwordHash,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      // Validate new password
      const validation = validatePassword(updateOwnProfileDto.new_password);
      if (!validation.isValid) {
        throw new BadRequestException(validation.errors.join(', '));
      }

      // Hash and update password
      user.passwordHash = await bcrypt.hash(updateOwnProfileDto.new_password, 10);
      user.mustChangePassword = false; // User set their own password
    }

    const updatedUser = await this.userRepository.save(user);
    return UserResponseDto.fromEntity(updatedUser);
  }

  /**
   * Change own password (any authenticated user)
   */
  async changeOwnPassword(
    userId: number,
    changePasswordDto: ChangeOwnPasswordDto,
  ): Promise<void> {
    const { current_password, new_password } = changePasswordDto;

    const user = await this.findOne(userId);

    // Check if password change is locked due to too many failed attempts
    if (user.isPasswordChangeLocked()) {
      const remainingTime = Math.ceil(
        (user.passwordChangeLockedUntil.getTime() - new Date().getTime()) / 1000 / 60
      );
      throw new UnauthorizedException(
        `Too many failed password change attempts. Please try again in ${remainingTime} minute(s).`
      );
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      current_password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      // Increment failed password change attempts
      user.failedPasswordChangeAttempts += 1;

      // Lock password change if too many failed attempts (5 attempts)
      const MAX_ATTEMPTS = 5;
      const LOCK_DURATION_MINUTES = 15;
      
      if (user.failedPasswordChangeAttempts >= MAX_ATTEMPTS) {
        user.passwordChangeLockedUntil = new Date(
          Date.now() + LOCK_DURATION_MINUTES * 60 * 1000
        );
        await this.userRepository.save(user);
        
        throw new UnauthorizedException(
          `Too many failed password change attempts. Your account has been locked for ${LOCK_DURATION_MINUTES} minutes.`
        );
      }

      await this.userRepository.save(user);
      
      throw new UnauthorizedException(
        `Current password is incorrect. ${MAX_ATTEMPTS - user.failedPasswordChangeAttempts} attempt(s) remaining.`
      );
    }

    // Validate new password
    const validation = validatePassword(new_password);
    if (!validation.isValid) {
      throw new BadRequestException(validation.errors.join(', '));
    }

    // Hash and update password
    user.passwordHash = await bcrypt.hash(new_password, 10);
    user.mustChangePassword = false; // User changed their own password
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.failedPasswordChangeAttempts = 0; // Reset password change attempts on success
    user.passwordChangeLockedUntil = null;

    await this.userRepository.save(user);
  }
}
