import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import {
  CreatePatientNoteDto,
  UpdatePatientNoteDto,
} from '../patient-note.dto';

describe('PatientNote DTOs', () => {
  describe('CreatePatientNoteDto', () => {
    it('should validate with "alteracao_de_status" category', async () => {
      const dto = plainToClass(CreatePatientNoteDto, {
        note_content: 'Paciente alterado para alta.',
        category: 'alteracao_de_status',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail for category longer than 50 chars', async () => {
      const dto = plainToClass(CreatePatientNoteDto, {
        note_content: 'Observacao',
        category: 'a'.repeat(51),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('category');
    });
  });

  describe('UpdatePatientNoteDto', () => {
    it('should validate with "alteracao_de_status" category', async () => {
      const dto = plainToClass(UpdatePatientNoteDto, {
        category: 'alteracao_de_status',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
