import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { RefreshToken } from './refresh-token.entity';

export enum UserRole {
  STAFF = 'staff',
  ADMIN = 'admin',
  DOCTOR = 'doctor',
  THERAPIST = 'therapist',
}

@Entity('hms_user')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ name: 'password_hash', length: 255 })
  @Exclude() // Never expose password hash in API responses
  passwordHash: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'display_name', length: 50, nullable: true })
  displayName: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: UserRole.STAFF,
  })
  role: UserRole;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'must_change_password', default: false })
  mustChangePassword: boolean;

  @Column({ name: 'last_login', nullable: true })
  lastLogin: Date;

  @Column({ name: 'failed_login_attempts', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'locked_until', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'failed_password_change_attempts', default: 0 })
  failedPasswordChangeAttempts: number;

  @Column({ name: 'password_change_locked_until', nullable: true })
  passwordChangeLockedUntil: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => RefreshToken, (refreshToken) => refreshToken.user)
  @Exclude() // Don't expose refresh tokens in user responses
  refreshTokens: RefreshToken[];

  /**
   * Check if the account is currently locked
   */
  isLocked(): boolean {
    return this.lockedUntil !== null && this.lockedUntil > new Date();
  }

  /**
   * Check if password change is currently locked (rate limiting)
   */
  isPasswordChangeLocked(): boolean {
    return this.passwordChangeLockedUntil !== null && this.passwordChangeLockedUntil > new Date();
  }
}
