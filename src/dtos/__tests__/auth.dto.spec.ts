import { validate } from 'class-validator';
import { LoginDto, RegisterDto } from '../auth.dto';
import { UserRole } from '../../entities/user.entity';

describe('auth DTO validation', () => {
  it('requires 12-character passwords for login', async () => {
    const dto = new LoginDto();
    dto.email = 'admin@example.com';
    dto.password = 'admin123';

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'password',
          constraints: expect.objectContaining({
            minLength: 'Password must be at least 12 characters long',
          }),
        }),
      ]),
    );
  });

  it('requires 12-character passwords for new registrations', async () => {
    const dto = new RegisterDto();
    dto.email = 'admin@example.com';
    dto.password = 'admin123';
    dto.name = 'Admin';
    dto.role = UserRole.ADMIN;

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'password',
          constraints: expect.objectContaining({
            minLength: 'Password must be at least 12 characters long',
          }),
        }),
      ]),
    );
  });
});
