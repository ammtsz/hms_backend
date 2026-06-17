import {
  ApiTreatmentOperation,
  ApiCreateTreatmentOperation,
  ApiUpdateTreatmentOperation,
  ApiDeleteTreatmentOperation,
  ApiGetTreatmentsByPatientOperation,
} from '../api-treatment.decorator';

describe('API Treatment decorators', () => {
  describe('ApiTreatmentOperation', () => {
    it('should be a function', () => {
      expect(typeof ApiTreatmentOperation).toBe('function');
    });

    it('should return a decorator function', () => {
      const decorator = ApiTreatmentOperation('Test summary');
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ApiCreateTreatmentOperation', () => {
    it('should be a function', () => {
      expect(typeof ApiCreateTreatmentOperation).toBe('function');
    });

    it('should return a decorator function', () => {
      const decorator = ApiCreateTreatmentOperation();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ApiUpdateTreatmentOperation', () => {
    it('should be a function', () => {
      expect(typeof ApiUpdateTreatmentOperation).toBe('function');
    });

    it('should return a decorator function', () => {
      const decorator = ApiUpdateTreatmentOperation();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ApiDeleteTreatmentOperation', () => {
    it('should be a function', () => {
      expect(typeof ApiDeleteTreatmentOperation).toBe('function');
    });

    it('should return a decorator function', () => {
      const decorator = ApiDeleteTreatmentOperation();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ApiGetTreatmentsByPatientOperation', () => {
    it('should be a function', () => {
      expect(typeof ApiGetTreatmentsByPatientOperation).toBe('function');
    });

    it('should return a decorator function', () => {
      const decorator = ApiGetTreatmentsByPatientOperation();
      expect(typeof decorator).toBe('function');
    });
  });
});
