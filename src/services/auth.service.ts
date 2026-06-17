import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import {
  LoginDto,
  RegisterDto,
  LoginResponseDto,
  UserResponseDto,
} from '../dtos/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Validate user credentials with timing attack protection
   * Always performs bcrypt comparison even if user doesn't exist
   */
  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email, isActive: true },
    });

    // Use a dummy hash if user doesn't exist to prevent timing attacks
    const hashToCompare = user?.passwordHash ||
      '$2b$10$dummyhashtopreventtimingattacksxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

    const isPasswordValid = await bcrypt.compare(password, hashToCompare);

    if (!user || !isPasswordValid) {
      // Add small random delay to further prevent timing analysis
      await new Promise(resolve =>
        setTimeout(resolve, Math.random() * 100)
      );
      return null;
    }

    return user;
  }

  /**
   * Login user and return tokens
   * Implements account lockout after failed attempts
   */
  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const { email, password } = loginDto;

    // Find user (even if inactive, to track failed attempts)
    const user = await this.userRepository.findOne({ where: { email } });

    // Check if account is locked
    if (user && user.isLocked()) {
      const minutesRemaining = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000
      );
      throw new UnauthorizedException(
        `Conta bloqueada. Tente novamente em ${minutesRemaining} minutos.`
      );
    }

    // Validate credentials
    const validatedUser = await this.validateUser(email, password);

    if (!validatedUser) {
      // Track failed login attempts
      if (user) {
        user.failedLoginAttempts += 1;

        if (user.failedLoginAttempts >= 5) {
          user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
          await this.userRepository.save(user);
          throw new UnauthorizedException(
            'Conta bloqueada por 15 minutos devido a múltiplas tentativas de login.'
          );
        }

        await this.userRepository.save(user);
      }

      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // Successful login - reset failed attempts and lock
    validatedUser.failedLoginAttempts = 0;
    validatedUser.lockedUntil = null;
    validatedUser.lastLogin = new Date();
    await this.userRepository.save(validatedUser);

    // Generate tokens
    const accessToken = this.generateAccessToken(validatedUser);
    const refreshToken = await this.generateRefreshToken(validatedUser);

    return {
      accessToken,
      refreshToken,
      user: UserResponseDto.fromEntity(validatedUser),
    };
  }

  /**
   * Register new user
   */
  async register(registerDto: RegisterDto): Promise<UserResponseDto> {
    const { email, password, name, role } = registerDto;

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email já está em uso');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create user
    const user = this.userRepository.create({
      email,
      passwordHash,
      name,
      role,
      isActive: true,
    });

    const savedUser = await this.userRepository.save(user);

    return UserResponseDto.fromEntity(savedUser);
  }

  /**
   * Refresh both tokens with rotation (H7 + L8).
   * Revokes the current refresh token and issues a fresh pair.
   */
  async refreshTokens(
    refreshTokenString: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshToken = await this.refreshTokenRepository.findOne({
      where: { token: refreshTokenString },
      relations: ['user'],
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Token inválido');
    }

    if (!refreshToken.isValid()) {
      throw new UnauthorizedException('Token expirado ou revogado');
    }

    if (!refreshToken.user.isActive) {
      throw new UnauthorizedException('Usuário inativo');
    }

    // Revoke the old refresh token immediately
    await this.refreshTokenRepository.update(refreshToken.id, {
      revokedAt: new Date(),
    });

    const user = refreshToken.user;
    const accessToken = this.generateAccessToken(user);
    const newRefreshToken = await this.generateRefreshToken(user);

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Logout user by revoking refresh token
   */
  async logout(refreshTokenString: string): Promise<void> {
    const refreshToken = await this.refreshTokenRepository.findOne({
      where: { token: refreshTokenString },
    });

    if (refreshToken) {
      // Mark token as revoked
      await this.refreshTokenRepository.update(refreshToken.id, {
        revokedAt: new Date(),
      });
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId, isActive: true },
    });
  }

  /**
   * Generate JWT access token (short-lived)
   */
  private generateAccessToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: '8h', // 8 hours
    });
  }

  /**
   * Generate and store refresh token (long-lived)
   */
  private async generateRefreshToken(user: User): Promise<string> {
    const payload = {
      sub: user.id,
      type: 'refresh',
    };

    const tokenString = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d', // 7 days
    });

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Store refresh token in database
    const refreshToken = this.refreshTokenRepository.create({
      userId: user.id,
      token: tokenString,
      expiresAt,
    });

    await this.refreshTokenRepository.save(refreshToken);

    // Clean up old expired tokens for this user
    await this.cleanupExpiredTokens(user.id);

    return tokenString;
  }

  /**
   * Hash password using bcrypt
   */
  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Clean up expired refresh tokens for a user
   */
  private async cleanupExpiredTokens(userId: number): Promise<void> {
    await this.refreshTokenRepository
      .createQueryBuilder()
      .delete()
      .where('user_id = :userId', { userId })
      .andWhere('expires_at < NOW()')
      .execute();
  }

  /**
   * Validate JWT token and return user
   */
  async validateToken(token: string): Promise<User | null> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      return this.getUserById(payload.sub);
    } catch (error) {
      return null;
    }
  }
}
