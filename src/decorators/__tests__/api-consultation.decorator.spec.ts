import {
  ApiConsultationOperation,
  ApiCreateConsultationOperation,
  ApiUpdateConsultationOperation,
  ApiDeleteConsultationOperation,
  ApiFindAllConsultationsOperation,
  ApiFindOneConsultationOperation,
  ApiFindConsultationByAttendanceOperation,
} from '../api-consultation.decorator';

// Mock class to test decorators
class TestController {
  @ApiConsultationOperation('Test operation')
  testOperation() {
    return 'test';
  }

  @ApiCreateConsultationOperation()
  createConsultation() {
    return 'create';
  }

  @ApiUpdateConsultationOperation()
  updateConsultation() {
    return 'update';
  }

  @ApiDeleteConsultationOperation()
  deleteConsultation() {
    return 'delete';
  }

  @ApiFindAllConsultationsOperation()
  findAllConsultations() {
    return 'findAll';
  }

  @ApiFindOneConsultationOperation()
  findOneConsultation() {
    return 'findOne';
  }

  @ApiFindConsultationByAttendanceOperation()
  findByAttendanceConsultation() {
    return 'findByAttendance';
  }
}

describe('API Consultation Decorators', () => {
  let controller: TestController;

  beforeEach(() => {
    controller = new TestController();
  });

  describe('ApiConsultationOperation', () => {
    it('should apply decorators to method', () => {
      expect(controller.testOperation()).toBe('test');
      expect(typeof ApiConsultationOperation).toBe('function');
    });

    it('should be callable with summary parameter', () => {
      const decorator = ApiConsultationOperation('Custom summary');
      expect(typeof decorator).toBe('function');
    });
  });

  describe('ApiCreateConsultationOperation', () => {
    it('should apply decorators to create method', () => {
      expect(controller.createConsultation()).toBe('create');
      expect(typeof ApiCreateConsultationOperation).toBe('function');
    });
  });

  describe('ApiUpdateConsultationOperation', () => {
    it('should apply decorators to update method', () => {
      expect(controller.updateConsultation()).toBe('update');
      expect(typeof ApiUpdateConsultationOperation).toBe('function');
    });
  });

  describe('ApiDeleteConsultationOperation', () => {
    it('should apply decorators to delete method', () => {
      expect(controller.deleteConsultation()).toBe('delete');
      expect(typeof ApiDeleteConsultationOperation).toBe('function');
    });
  });

  describe('ApiFindAllConsultationsOperation', () => {
    it('should apply decorators to findAll method', () => {
      expect(controller.findAllConsultations()).toBe('findAll');
      expect(typeof ApiFindAllConsultationsOperation).toBe('function');
    });
  });

  describe('ApiFindOneConsultationOperation', () => {
    it('should apply decorators to findOne method', () => {
      expect(controller.findOneConsultation()).toBe('findOne');
      expect(typeof ApiFindOneConsultationOperation).toBe('function');
    });
  });

  describe('ApiFindConsultationByAttendanceOperation', () => {
    it('should apply decorators to findByAttendance method', () => {
      expect(controller.findByAttendanceConsultation()).toBe(
        'findByAttendance',
      );
      expect(typeof ApiFindConsultationByAttendanceOperation).toBe(
        'function',
      );
    });
  });

  describe('Decorator functionality', () => {
    it('should create decorators that can be applied to methods', () => {
      expect(typeof ApiConsultationOperation('test')).toBe('function');
      expect(typeof ApiCreateConsultationOperation()).toBe('function');
      expect(typeof ApiUpdateConsultationOperation()).toBe('function');
      expect(typeof ApiDeleteConsultationOperation()).toBe('function');
      expect(typeof ApiFindAllConsultationsOperation()).toBe('function');
      expect(typeof ApiFindOneConsultationOperation()).toBe('function');
      expect(typeof ApiFindConsultationByAttendanceOperation()).toBe(
        'function',
      );
    });
  });
});
