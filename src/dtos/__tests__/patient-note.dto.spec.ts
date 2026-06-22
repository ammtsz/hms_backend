import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import {
  CreatePatientNoteDto,
  UpdatePatientNoteDto,
} from '../patient-note.dto';

describe('PatientNote DTOs', () => {
  describe('CreatePatientNoteDto', () => {
    it('should validate with "status_change" category', async () => {
      const dto = plainToClass(CreatePatientNoteDto, {
        note_content: 'Patient changed to discharged.',
        category: 'status_change',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail for category longer than 50 chars', async () => {
      const dto = plainToClass(CreatePatientNoteDto, {
        note_content: 'Observation',
        category: 'a'.repeat(51),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('category');
    });
  });

  describe('UpdatePatientNoteDto', () => {
    it('should validate with "status_change" category', async () => {
      const dto = plainToClass(UpdatePatientNoteDto, {
        category: 'status_change',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
