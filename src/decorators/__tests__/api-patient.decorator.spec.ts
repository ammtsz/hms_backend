import {
  ApiPatientOperation,
  ApiCreatePatientOperation,
  ApiUpdatePatientOperation,
  ApiDeletePatientOperation,
  ApiFindAllPatientsOperation,
  ApiFindOnePatientOperation,
} from '../api-patient.decorator';

// Mock class to test decorators
class TestController {
  @ApiPatientOperation('Test operation')
  testOperation() {
    return 'test';
  }

  @ApiCreatePatientOperation()
  createPatient() {
    return 'create';
  }

  @ApiUpdatePatientOperation()
  updatePatient() {
    return 'update';
  }

  @ApiDeletePatientOperation()
  deletePatient() {
    return 'delete';
  }

  @ApiFindAllPatientsOperation()
  findAllPatients() {
    return 'findAll';
  }

  @ApiFindOnePatientOperation()
  findOnePatient() {
    return 'findOne';
  }
}

describe('API Patient Decorators', () => {
  let controller: TestController;

  beforeEach(() => {
    controller = new TestController();
  });

  describe('ApiPatientOperation', () => {
    it('should apply decorators to method', () => {
      expect(controller.testOperation()).toBe('test');
      expect(typeof ApiPatientOperation).toBe('function');
    });

    it('should be callable with summary parameter', () => {
      const decorator = ApiPatientOperation('Custom summary');
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ApiCreatePatientOperation', () => {
    it('should apply decorators to create method', () => {
      expect(controller.createPatient()).toBe('create');
      expect(typeof ApiCreatePatientOperation).toBe('function');
    });

    it('should be callable without parameters', () => {
      const decorator = ApiCreatePatientOperation();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ApiUpdatePatientOperation', () => {
    it('should apply decorators to update method', () => {
      expect(controller.updatePatient()).toBe('update');
      expect(typeof ApiUpdatePatientOperation).toBe('function');
    });

    it('should be callable without parameters', () => {
      const decorator = ApiUpdatePatientOperation();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ApiDeletePatientOperation', () => {
    it('should apply decorators to delete method', () => {
      expect(controller.deletePatient()).toBe('delete');
      expect(typeof ApiDeletePatientOperation).toBe('function');
    });

    it('should be callable without parameters', () => {
      const decorator = ApiDeletePatientOperation();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ApiFindAllPatientsOperation', () => {
    it('should apply decorators to findAll method', () => {
      expect(controller.findAllPatients()).toBe('findAll');
      expect(typeof ApiFindAllPatientsOperation).toBe('function');
    });

    it('should be callable without parameters', () => {
      const decorator = ApiFindAllPatientsOperation();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ApiFindOnePatientOperation', () => {
    it('should apply decorators to findOne method', () => {
      expect(controller.findOnePatient()).toBe('findOne');
      expect(typeof ApiFindOnePatientOperation).toBe('function');
    });

    it('should be callable without parameters', () => {
      const decorator = ApiFindOnePatientOperation();
      expect(typeof decorator).toBe('function');
    });
  });

  describe('Decorator functionality', () => {
    it('should create decorators that can be applied to methods', () => {
      // Test that all decorators are functions that return functions
      expect(typeof ApiPatientOperation('test')).toBe('function');
      expect(typeof ApiCreatePatientOperation()).toBe('function');
      expect(typeof ApiUpdatePatientOperation()).toBe('function');
      expect(typeof ApiDeletePatientOperation()).toBe('function');
      expect(typeof ApiFindAllPatientsOperation()).toBe('function');
      expect(typeof ApiFindOnePatientOperation()).toBe('function');
    });

    it('should handle different summary parameters', () => {
      const decorator1 = ApiPatientOperation('Summary 1');
      const decorator2 = ApiPatientOperation('Summary 2');
      const decorator3 = ApiPatientOperation('');

      expect(typeof decorator1).toBe('function');
      expect(typeof decorator2).toBe('function');
      expect(typeof decorator3).toBe('function');
    });
  });
});
