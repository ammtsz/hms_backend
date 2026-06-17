import { validate } from 'class-validator';
import {
  CreateScheduleSettingDto,
  UpdateScheduleSettingDto,
  ScheduleSettingResponseDto,
} from '../schedule-setting.dto';

describe('Schedule Setting DTOs', () => {
  describe('CreateScheduleSettingDto', () => {
    it('should validate with valid data', async () => {
      const dto = new CreateScheduleSettingDto();
      dto.day_of_week = 1;
      dto.start_time = '09:00';
      dto.end_time = '17:00';
      dto.max_concurrent_assessment = 2;
      dto.max_concurrent_physiotherapy_tens = 3;
      dto.is_active = true;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with minimal required data', async () => {
      const dto = new CreateScheduleSettingDto();
      dto.day_of_week = 1;
      dto.start_time = '09:00';
      dto.end_time = '17:00';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should apply default values for optional fields', () => {
      const dto = new CreateScheduleSettingDto();
      dto.day_of_week = 1;
      dto.start_time = '09:00';
      dto.end_time = '17:00';

      expect(dto.max_concurrent_assessment).toBe(1);
      expect(dto.max_concurrent_physiotherapy_tens).toBe(1);
      expect(dto.is_active).toBe(true);
    });

    it('should fail validation with invalid day_of_week (negative)', async () => {
      const dto = new CreateScheduleSettingDto();
      dto.day_of_week = -1;
      dto.start_time = '09:00';
      dto.end_time = '17:00';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('day_of_week');
    });

    it('should fail validation with invalid day_of_week (greater than 6)', async () => {
      const dto = new CreateScheduleSettingDto();
      dto.day_of_week = 7;
      dto.start_time = '09:00';
      dto.end_time = '17:00';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('day_of_week');
    });

    it('should fail validation with invalid start_time format', async () => {
      const dto = new CreateScheduleSettingDto();
      dto.day_of_week = 1;
      dto.start_time = '9:00';
      dto.end_time = '17:00';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('start_time');
      expect(errors[0].constraints?.matches).toContain(
        'Time must be in format HH:mm',
      );
    });

    it('should fail validation with invalid end_time format', async () => {
      const dto = new CreateScheduleSettingDto();
      dto.day_of_week = 1;
      dto.start_time = '09:00';
      dto.end_time = '25:00';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('end_time');
      expect(errors[0].constraints?.matches).toContain(
        'Time must be in format HH:mm',
      );
    });

    it('should fail validation with invalid max_concurrent_assessment (zero)', async () => {
      const dto = new CreateScheduleSettingDto();
      dto.day_of_week = 1;
      dto.start_time = '09:00';
      dto.end_time = '17:00';
      dto.max_concurrent_assessment = 0;

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('max_concurrent_assessment');
    });

    it('should fail validation with invalid max_concurrent_physiotherapy_tens (zero)', async () => {
      const dto = new CreateScheduleSettingDto();
      dto.day_of_week = 1;
      dto.start_time = '09:00';
      dto.end_time = '17:00';
      dto.max_concurrent_physiotherapy_tens = 0;

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('max_concurrent_physiotherapy_tens');
    });

    it('should validate with valid time ranges', async () => {
      const dto = new CreateScheduleSettingDto();
      dto.day_of_week = 1;
      dto.start_time = '00:00';
      dto.end_time = '23:59';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation when missing required fields', async () => {
      const dto = new CreateScheduleSettingDto();

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const errorProperties = errors.map((e) => e.property);
      expect(errorProperties).toContain('day_of_week');
      expect(errorProperties).toContain('start_time');
      expect(errorProperties).toContain('end_time');
    });
  });

  describe('UpdateScheduleSettingDto', () => {
    it('should extend CreateScheduleSettingDto', async () => {
      const dto = new UpdateScheduleSettingDto();
      dto.day_of_week = 2;
      dto.start_time = '10:00';
      dto.end_time = '18:00';
      dto.is_active = false;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should inherit all validation from CreateScheduleSettingDto', async () => {
      const dto = new UpdateScheduleSettingDto();
      dto.day_of_week = -1;
      dto.start_time = 'invalid';
      dto.end_time = '25:00';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const errorProperties = errors.map((e) => e.property);
      expect(errorProperties).toContain('day_of_week');
      expect(errorProperties).toContain('start_time');
      expect(errorProperties).toContain('end_time');
    });
  });

  describe('ScheduleSettingResponseDto', () => {
    it('should have all required properties defined', () => {
      const dto = new ScheduleSettingResponseDto();
      dto.id = 1;
      dto.day_of_week = 1;
      dto.start_time = '09:00';
      dto.end_time = '17:00';
      dto.max_concurrent_assessment = 2;
      dto.max_concurrent_physiotherapy_tens = 3;
      dto.is_active = true;
      dto.created_date = '2025-07-22';
      dto.created_time = '09:00:00';
      dto.updated_date = '2025-07-22';
      dto.updated_time = '09:00:00';

      expect(dto).toHaveProperty('id');
      expect(dto).toHaveProperty('day_of_week');
      expect(dto).toHaveProperty('start_time');
      expect(dto).toHaveProperty('end_time');
      expect(dto).toHaveProperty('max_concurrent_assessment');
      expect(dto).toHaveProperty('max_concurrent_physiotherapy_tens');
      expect(dto).toHaveProperty('is_active');
      expect(dto).toHaveProperty('created_date');
      expect(dto).toHaveProperty('created_time');
      expect(dto).toHaveProperty('updated_date');
      expect(dto).toHaveProperty('updated_time');
    });

    it('should be instantiable with full data', () => {
      const dto = new ScheduleSettingResponseDto();
      dto.id = 1;
      dto.day_of_week = 1;
      dto.start_time = '09:00';
      dto.end_time = '17:00';
      dto.max_concurrent_assessment = 2;
      dto.max_concurrent_physiotherapy_tens = 3;
      dto.is_active = true;
      dto.created_date = '2025-07-22';
      dto.created_time = '09:00:00';
      dto.updated_date = '2025-07-22';
      dto.updated_time = '09:00:00';

      expect(dto.id).toBe(1);
      expect(dto.day_of_week).toBe(1);
      expect(dto.start_time).toBe('09:00');
      expect(dto.end_time).toBe('17:00');
      expect(dto.max_concurrent_assessment).toBe(2);
      expect(dto.max_concurrent_physiotherapy_tens).toBe(3);
      expect(dto.is_active).toBe(true);
    });
  });
});
