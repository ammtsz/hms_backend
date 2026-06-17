import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { UserService } from '../services/user.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateOwnProfileDto,
  ResetPasswordDto,
  ChangeOwnPasswordDto,
  UserListResponseDto,
} from '../dtos/user.dto';
import { UserResponseDto } from '../dtos/auth.dto';

@ApiTags('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Create new user (admin only)
   */
  @Post()
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new user (admin only)' })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: UserListResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
  })
  @ApiResponse({
    status: 409,
    description: 'Email already in use',
  })
  async create(@Body() createUserDto: CreateUserDto): Promise<UserListResponseDto> {
    return this.userService.createUser(createUserDto);
  }

  /**
   * Get all users (admin only)
   */
  @Get()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get all users (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    type: [UserListResponseDto],
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
  })
  async findAll(): Promise<UserListResponseDto[]> {
    return this.userService.findAll();
  }

  /**
   * Update user (admin only)
   */
  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update user (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserListResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserListResponseDto> {
    return this.userService.updateUser(+id, updateUserDto);
  }

  /**
   * Delete user permanently (admin only)
   */
  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete user permanently (admin only)' })
  @ApiResponse({
    status: 204,
    description: 'User deleted successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async delete(@Param('id') id: string): Promise<void> {
    return this.userService.deleteUser(+id);
  }

  /**
   * Deactivate user (soft delete) (admin only)
   */
  @Patch(':id/deactivate')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Deactivate user (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'User deactivated successfully',
    type: UserListResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async deactivate(@Param('id') id: string): Promise<UserListResponseDto> {
    return this.userService.deactivateUser(+id);
  }

  /**
   * Reactivate user (admin only)
   */
  @Patch(':id/reactivate')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Reactivate user (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'User reactivated successfully',
    type: UserListResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async reactivate(@Param('id') id: string): Promise<UserListResponseDto> {
    return this.userService.reactivateUser(+id);
  }

  /**
   * Reset user password (admin only)
   */
  @Post('reset-password')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset user password (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    await this.userService.resetUserPassword(resetPasswordDto);
    return { message: 'Password reset successfully' };
  }

  /**
   * Update own profile (any authenticated user)
   */
  @Patch('profile/me')
  @ApiOperation({ summary: 'Update own profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated',
  })
  async updateOwnProfile(
    @Request() req,
    @Body() updateOwnProfileDto: UpdateOwnProfileDto,
  ): Promise<UserResponseDto> {
    return this.userService.updateOwnProfile(req.user.id, updateOwnProfileDto);
  }

  /**
   * Change own password (any authenticated user)
   */
  @Post('profile/change-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Change own password' })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or incorrect current password',
  })
  async changePassword(
    @Request() req,
    @Body() changePasswordDto: ChangeOwnPasswordDto,
  ): Promise<{ message: string }> {
    await this.userService.changeOwnPassword(req.user.id, changePasswordDto);
    return { message: 'Password changed successfully' };
  }
}
