import {
  IsEmail,
  IsString,
  IsBoolean,
  IsEnum,
  IsOptional,
  MinLength,
  IsNotEmpty,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Sanitize } from '../common/decorators/sanitize.decorator';
import { UserRole } from '../entities/user.entity';

/**
 * DTO for creating a new user (admin only)
 */
export class CreateUserDto {
  @ApiProperty({
    description: 'User email address (used for login)',
    example: 'joao.silva@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Full name',
    example: 'John Smith',
  })
  @Sanitize()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Display name (shown in UI)',
    example: 'Dr. John',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  display_name?: string;

  @ApiProperty({
    description: 'Password (minimum 12 characters)',
    example: 'SecurePass123',
    minLength: 12,
  })
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    description: 'User role',
    enum: UserRole,
    example: UserRole.STAFF,
  })
  @IsEnum(UserRole)
  @IsNotEmpty()
  role: UserRole;

  @ApiProperty({
    description: 'Whether the user account is active',
    example: true,
  })
  @IsBoolean()
  is_active: boolean;

  @ApiPropertyOptional({
    description: 'Force user to change password on next login',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  must_change_password?: boolean;
}

/**
 * DTO for updating a user (admin only)
 */
export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Full name',
    example: 'John Smith',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Email address',
    example: 'joao.silva@example.com',
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'Display name',
    example: 'Dr. John',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  display_name?: string;

  @ApiPropertyOptional({
    description: 'User role',
    enum: UserRole,
    example: UserRole.STAFF,
  })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Whether the user account is active',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

/**
 * DTO for user updating their own profile
 */
export class UpdateOwnProfileDto {
  @ApiPropertyOptional({
    description: 'Full name (admin only)',
    example: 'John Smith',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Email address (admin only)',
    example: 'joao.silva@example.com',
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'Display name',
    example: 'Johnny',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  display_name?: string;

  @ApiPropertyOptional({
    description: 'Current password (required if changing password)',
  })
  @IsString()
  @IsOptional()
  current_password?: string;

  @ApiPropertyOptional({
    description: 'New password (minimum 12 characters)',
    minLength: 12,
  })
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  @IsOptional()
  new_password?: string;
}

/**
 * DTO for admin resetting user password
 */
export class ResetPasswordDto {
  @ApiProperty({
    description: 'User ID',
    example: 1,
  })
  @IsNumber()
  @IsNotEmpty()
  user_id: number;

  @ApiProperty({
    description: 'New password (minimum 12 characters)',
    minLength: 12,
  })
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  @IsNotEmpty()
  new_password: string;

  @ApiProperty({
    description: 'Force user to change password on next login',
    example: true,
    default: true,
  })
  @IsBoolean()
  must_change_password: boolean;
}

/**
 * DTO for changing own password
 */
export class ChangeOwnPasswordDto {
  @ApiProperty({
    description: 'Current password',
  })
  @IsString()
  @IsNotEmpty()
  current_password: string;

  @ApiProperty({
    description: 'New password (minimum 12 characters)',
    minLength: 12,
  })
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  @IsNotEmpty()
  new_password: string;
}

/**
 * Response DTO for user list (hides sensitive data)
 */
export class UserListResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  display_name: string | null;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty()
  is_active: boolean;

  @ApiProperty()
  must_change_password: boolean;

  @ApiProperty({ nullable: true })
  last_login: Date | null;

  @ApiProperty()
  created_at: Date;

  /**
   * Transform User entity to list response DTO
   */
  static fromEntity(user: any): UserListResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      display_name: user.display_name ?? user.displayName ?? null,
      role: user.role,
      is_active: user.is_active ?? user.isActive,
      must_change_password: user.must_change_password ?? user.mustChangePassword,
      last_login: user.last_login ?? user.lastLogin,
      created_at: user.created_at ?? user.createdAt,
    };
  }
}
