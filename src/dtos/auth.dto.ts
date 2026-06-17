import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';
import { Sanitize } from '../common/decorators/sanitize.decorator';
import { UserRole } from '../entities/user.entity';

// Login request DTO
export class LoginDto {
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @IsString({ message: 'Senha deve ser uma string' })
  @IsNotEmpty({ message: 'Senha é obrigatória' })
  @MinLength(12, { message: 'Senha deve ter no mínimo 12 caracteres' })
  password: string;
}

// Register request DTO
export class RegisterDto {
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @IsString({ message: 'Senha deve ser uma string' })
  @IsNotEmpty({ message: 'Senha é obrigatória' })
  @MinLength(12, { message: 'Senha deve ter no mínimo 12 caracteres' })
  password: string;

  @Sanitize()
  @IsString({ message: 'Nome deve ser uma string' })
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name: string;

  @IsString({ message: 'Função deve ser uma string' })
  @IsNotEmpty({ message: 'Função é obrigatória' })
  role: UserRole;
}

// Refresh token request DTO
export class RefreshTokenDto {
  @IsString({ message: 'Token deve ser uma string' })
  @IsNotEmpty({ message: 'Token é obrigatório' })
  refreshToken: string;
}

type UserResponseSource = {
  id: number;
  email: string;
  name: string;
  displayName?: string | null;
  display_name?: string | null;
  role: UserRole;
  isActive?: boolean;
  is_active?: boolean;
  mustChangePassword?: boolean;
  must_change_password?: boolean;
  lastLogin?: Date | null;
  last_login?: Date | null;
  createdAt?: Date;
  created_at?: Date;
};

// User response DTO (what gets sent to client)
export class UserResponseDto {
  id: number;
  email: string;
  name: string;
  display_name: string | null;
  role: UserRole;
  isActive: boolean;
  must_change_password: boolean;
  lastLogin: Date | null;
  createdAt: Date;

  // Transform from User entity to response DTO
  static fromEntity(user: UserResponseSource): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      display_name: user.displayName ?? user.display_name ?? null,
      role: user.role,
      isActive: user.is_active ?? user.isActive,
      must_change_password: user.must_change_password ?? user.mustChangePassword ?? false,
      lastLogin: user.last_login ?? user.lastLogin,
      createdAt: user.created_at ?? user.createdAt,
    };
  }
}

// Login response DTO
export class LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  user: UserResponseDto;
}

// Refresh response DTO (BFF sets httpOnly cookies from JSON — no Set-Cookie from backend)
export class RefreshResponseDto {
  accessToken: string;
  refreshToken: string;
}
