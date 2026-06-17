import {
  ApiCreateSessionOperation,
  ApiUpdateSessionOperation,
  ApiDeleteSessionOperation,
  ApiGetSessionsByTreatmentOperation,
} from '../api-session.decorator';

describe('ApiSessionDecorators', () => {
  describe('ApiCreateSessionOperation', () => {
    it('should be a function', () => {
      expect(typeof ApiCreateSessionOperation).toBe('function');
    });

    it('should return a composed decorator', () => {
      const decorator = ApiCreateSessionOperation();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ApiUpdateSessionOperation', () => {
    it('should be a function', () => {
      expect(typeof ApiUpdateSessionOperation).toBe('function');
    });

    it('should return a composed decorator', () => {
      const decorator = ApiUpdateSessionOperation();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ApiDeleteSessionOperation', () => {
    it('should be a function', () => {
      expect(typeof ApiDeleteSessionOperation).toBe('function');
    });

    it('should return a composed decorator', () => {
      const decorator = ApiDeleteSessionOperation();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ApiGetSessionsByTreatmentOperation', () => {
    it('should be a function', () => {
      expect(typeof ApiGetSessionsByTreatmentOperation).toBe('function');
    });

    it('should return a composed decorator', () => {
      const decorator = ApiGetSessionsByTreatmentOperation();
      expect(typeof decorator).toBe('function');
    });
  });
});
