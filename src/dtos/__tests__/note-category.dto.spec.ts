import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { CreateNoteCategoryDto } from '../note-category.dto';

describe('CreateNoteCategoryDto', () => {
  it('should validate a complete dto', async () => {
    const dto = plainToClass(CreateNoteCategoryDto, {
      value: 'status_change',
      label: 'Status change',
      sort_order: 2,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should allow omitting sort_order', async () => {
    const dto = plainToClass(CreateNoteCategoryDto, {
      value: 'general',
      label: 'General',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject value longer than 50 chars', async () => {
    const dto = plainToClass(CreateNoteCategoryDto, {
      value: 'a'.repeat(51),
      label: 'X',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'value')).toBe(true);
  });

  it('should reject value with invalid characters', async () => {
    const dto = plainToClass(CreateNoteCategoryDto, {
      value: 'status$change',
      label: 'X',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'value')).toBe(true);
  });
});
