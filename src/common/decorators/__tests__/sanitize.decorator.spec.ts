import { plainToInstance } from 'class-transformer';
import { validate, IsOptional } from 'class-validator';
import { Sanitize } from '../sanitize.decorator';
import { IsString, IsNotEmpty } from 'class-validator';

class TestDto {
  @Sanitize()
  @IsString()
  @IsNotEmpty()
  name: string;

  @Sanitize()
  @IsString()
  @IsOptional()
  note?: string;
}

describe('Sanitize Decorator', () => {
  it('should remove script tags from input', async () => {
    const input = {
      name: "<script>alert('xss')</script>John Doe",
    };

    const dto = plainToInstance(TestDto, input);
    const errors = await validate(dto);

    // Debug: log errors and actual value
    if (errors.length > 0) {
      console.log('Validation errors:', errors);
      console.log('Actual value:', dto.name);
    }

    expect(errors.length).toBe(0);
    expect(dto.name).toBe("John Doe");
    expect(dto.name).not.toContain('<script>');
  });

  it('should remove img tags with onerror', async () => {
    const input = {
      name: "<img src=x onerror=alert('xss')>Test Name",
    };

    const dto = plainToInstance(TestDto, input);
    const errors = await validate(dto);

    expect(dto.name).not.toContain('<img');
    expect(dto.name).not.toContain('onerror');
  });

  it('should preserve normal text', async () => {
    const input = {
      name: 'João Silva',
      note: 'Regular note with normal text',
    };

    const dto = plainToInstance(TestDto, input);
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
    expect(dto.name).toBe('João Silva');
    expect(dto.note).toBe('Regular note with normal text');
  });

  it('should preserve special characters and accents', async () => {
    const input = {
      name: "O'Brien & María José (Test)",
    };

    const dto = plainToInstance(TestDto, input);
    const errors = await validate(dto);

    expect(dto.name).toBe("O'Brien & María José (Test)");
  });

  it('should handle unicode characters', async () => {
    const input = {
      name: '日本語 テスト 中文测试',
    };

    const dto = plainToInstance(TestDto, input);
    const errors = await validate(dto);

    expect(dto.name).toBe('日本語 テスト 中文测试');
  });

  it('should trim whitespace', async () => {
    const input = {
      name: '  Spaces Around  ',
    };

    const dto = plainToInstance(TestDto, input);
    const errors = await validate(dto);

    expect(dto.name).toBe('Spaces Around');
  });

  it('should handle empty strings after sanitization', async () => {
    const input = {
      name: '<script></script>',
    };

    const dto = plainToInstance(TestDto, input);
    const errors = await validate(dto);

    // Should fail validation because name is required
    expect(errors.length).toBeGreaterThan(0);
    expect(dto.name).toBe('');
  });

  it('should handle nested HTML tags', async () => {
    const input = {
      name: '<div><span>Nested</span></div>Text',
    };

    const dto = plainToInstance(TestDto, input);
    const errors = await validate(dto);

    expect(dto.name).toBe('NestedText');
    expect(dto.name).not.toContain('<div>');
    expect(dto.name).not.toContain('<span>');
  });

  it('should handle SQL injection attempts', async () => {
    const input = {
      name: "'; DROP TABLE users; --",
    };

    const dto = plainToInstance(TestDto, input);
    const errors = await validate(dto);

    // Should preserve the text (SQL injection is prevented at DB level)
    expect(dto.name).toBe("'; DROP TABLE users; --");
  });

  it('should handle null and undefined gracefully', async () => {
    const input = {
      name: 'Valid Name',
      note: undefined,
    };

    const dto = plainToInstance(TestDto, input);
    const errors = await validate(dto);

    expect(dto.name).toBe('Valid Name');
    expect(dto.note).toBeUndefined();
  });
});
