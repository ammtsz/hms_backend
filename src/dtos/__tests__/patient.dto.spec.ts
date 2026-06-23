import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import {
  CreatePatientDto,
  UpdatePatientDto,
  PatientResponseDto,
} from '../patient.dto';
import { PatientPriority, PatientStatus } from '../../common/enums';

describe('Patient DTOs', () => {
  describe('CreatePatientDto', () => {
    it('should validate with valid data', async () => {
      const dto = new CreatePatientDto();
      dto.name = 'John Doe';
      dto.phone = '(555) 123-4567';
      dto.priority = PatientPriority.LEVEL_3;
      dto.patient_status = PatientStatus.IN_TREATMENT;
      dto.birth_date = '1990-01-01';
      dto.main_concern = 'Frequent headaches';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with minimal required data', async () => {
      const dto = new CreatePatientDto();
      dto.name = 'Jane Doe';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation when name is empty', async () => {
      const dto = new CreatePatientDto();
      dto.name = '';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('name');
    });

    it('should fail validation when name is missing', async () => {
      const dto = new CreatePatientDto();

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('name');
    });

    it('should fail validation with invalid phone format', async () => {
      const dto = new CreatePatientDto();
      dto.name = 'John Doe';
      dto.phone = '1234567890';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('phone');
      expect(errors[0].constraints?.matches).toContain(
        'format (XXX) XXX-XXXX',
      );
    });

    it('should validate with valid US phone format', async () => {
      const dto = new CreatePatientDto();
      dto.name = 'John Doe';
      dto.phone = '(555) 123-4567';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with wrong digit grouping', async () => {
      const dto = new CreatePatientDto();
      dto.name = 'John Doe';
      dto.phone = '(55) 123-4567';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('phone');
    });

    it('should fail validation with invalid priority enum', async () => {
      const dto = plainToClass(CreatePatientDto, {
        name: 'John Doe',
        priority: 'INVALID_PRIORITY',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('priority');
    });

    it('should fail validation with invalid patient_status enum', async () => {
      const dto = plainToClass(CreatePatientDto, {
        name: 'John Doe',
        patient_status: 'INVALID_STATUS',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('patient_status');
    });

    it('should apply default values for optional fields', () => {
      const dto = new CreatePatientDto();
      dto.name = 'John Doe';

      expect(dto.priority).toBe(PatientPriority.LEVEL_3);
      expect(dto.patient_status).toBe(PatientStatus.NEW_PATIENT);
    });

    it('should accept birth_date as string', () => {
      const dto = plainToClass(CreatePatientDto, {
        name: 'John Doe',
        birth_date: '1990-06-15',
      });

      expect(dto.birth_date).toBe('1990-06-15');
      expect(dto.birth_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('UpdatePatientDto', () => {
    it('should extend CreatePatientDto with discharge_date', async () => {
      const dto = new UpdatePatientDto();
      dto.name = 'John Doe';
      dto.discharge_date = '2025-12-31';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept discharge_date as string', () => {
      const dto = plainToClass(UpdatePatientDto, {
        name: 'John Doe',
        discharge_date: '2025-12-31',
      });

      expect(dto.discharge_date).toBe('2025-12-31');
      expect(dto.discharge_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should allow all fields to be optional for partial updates', async () => {
      const dto = new UpdatePatientDto();
      // No fields set - should be valid for partial updates

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate fields when they are provided', async () => {
      const dto = new UpdatePatientDto();
      dto.phone = 'invalid-phone'; // Invalid phone format should fail validation

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('phone');
    });

    it('should accept cancellation_reason with up to 2000 characters', async () => {
      const dto = new UpdatePatientDto();
      dto.cancellation_reason = 'a'.repeat(2000);

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail when cancellation_reason exceeds 2000 characters', async () => {
      const dto = new UpdatePatientDto();
      dto.cancellation_reason = 'a'.repeat(2001);

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('cancellation_reason');
      expect(errors[0].constraints?.maxLength).toBe(
        'Cancellation reason cannot exceed 2000 characters',
      );
    });
  });

  describe('PatientResponseDto', () => {
    it('should have all required properties defined', () => {
      const dto = new PatientResponseDto();
      dto.id = 1;
      dto.name = 'Test';
      dto.phone = '(555) 123-4567'; // Set optional property
      dto.priority = PatientPriority.LEVEL_3;
      dto.patient_status = PatientStatus.IN_TREATMENT;
      dto.birth_date = '1990-01-01'; // Set optional property
      dto.main_concern = 'Test complaint'; // Set optional property
      dto.discharge_date = '2025-12-31'; // Set optional property
      dto.start_date = '2025-07-22';
      dto.created_date = '2025-07-22';
      dto.created_time = '09:00:00';
      dto.updated_date = '2025-07-22';
      dto.updated_time = '09:00:00';

      expect(dto).toHaveProperty('id');
      expect(dto).toHaveProperty('name');
      expect(dto).toHaveProperty('phone');
      expect(dto).toHaveProperty('priority');
      expect(dto).toHaveProperty('patient_status');
      expect(dto).toHaveProperty('birth_date');
      expect(dto).toHaveProperty('main_concern');
      expect(dto).toHaveProperty('discharge_date');
      expect(dto).toHaveProperty('start_date');
      expect(dto).toHaveProperty('created_date');
      expect(dto).toHaveProperty('created_time');
      expect(dto).toHaveProperty('updated_date');
      expect(dto).toHaveProperty('updated_time');
    });

    it('should be instantiable with full data', () => {
      const dto = new PatientResponseDto();
      dto.id = 1;
      dto.name = 'John Doe';
      dto.phone = '(555) 123-4567';
      dto.priority = PatientPriority.LEVEL_1;
      dto.patient_status = PatientStatus.DISCHARGED;
      dto.birth_date = '1990-01-01';
      dto.main_concern = 'Frequent headaches';
      dto.discharge_date = '2025-12-31';
      dto.start_date = '2025-07-22';
      dto.created_date = '2025-07-22';
      dto.created_time = '09:00:00';
      dto.updated_date = '2025-07-22';
      dto.updated_time = '09:00:00';

      expect(dto.id).toBe(1);
      expect(dto.name).toBe('John Doe');
      expect(dto.priority).toBe(PatientPriority.LEVEL_1);
      expect(dto.patient_status).toBe(PatientStatus.DISCHARGED);
    });
  });
});
