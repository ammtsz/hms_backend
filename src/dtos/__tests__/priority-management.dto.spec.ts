import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { BulkUpdatePatientsPriorityDto } from '../priority-management.dto';
import { PatientPriority } from '../../common/enums';

describe('BulkUpdatePatientsPriorityDto', () => {
  it('should validate with non-empty patient_ids and enum priority', async () => {
    const dto = plainToClass(BulkUpdatePatientsPriorityDto, {
      patient_ids: [1, 2],
      priority: PatientPriority.LEVEL_3,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject empty patient_ids', async () => {
    const dto = plainToClass(BulkUpdatePatientsPriorityDto, {
      patient_ids: [],
      priority: PatientPriority.LEVEL_3,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-integer patient id', async () => {
    const dto = plainToClass(BulkUpdatePatientsPriorityDto, {
      patient_ids: [1.5],
      priority: PatientPriority.LEVEL_3,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
