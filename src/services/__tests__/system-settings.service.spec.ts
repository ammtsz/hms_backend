import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SystemSettingsService } from '../system-settings.service';
import { SystemSetting } from '../../entities/system-setting.entity';

describe('SystemSettingsService', () => {
  let service: SystemSettingsService;

  const mockRepository = {
    findOne: jest.fn(),
    upsert: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemSettingsService,
        {
          provide: getRepositoryToken(SystemSetting),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<SystemSettingsService>(SystemSettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMissingAppointmentsThreshold', () => {
    it('should return default 3 when no setting exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getMissingAppointmentsThreshold();

      expect(result).toBe(3);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { key: 'missing_appointments_threshold' },
      });
    });

    it('should return default 3 when value is empty', async () => {
      mockRepository.findOne.mockResolvedValue({
        key: 'missing_appointments_threshold',
        value: '',
      });

      const result = await service.getMissingAppointmentsThreshold();

      expect(result).toBe(3);
    });

    it('should return stored value when valid (1-10)', async () => {
      mockRepository.findOne.mockResolvedValue({
        key: 'missing_appointments_threshold',
        value: '5',
      });

      const result = await service.getMissingAppointmentsThreshold();

      expect(result).toBe(5);
    });

    it('should return default when value is invalid (NaN)', async () => {
      mockRepository.findOne.mockResolvedValue({
        key: 'missing_appointments_threshold',
        value: 'invalid',
      });

      const result = await service.getMissingAppointmentsThreshold();

      expect(result).toBe(3);
    });

    it('should return default when value is below minimum', async () => {
      mockRepository.findOne.mockResolvedValue({
        key: 'missing_appointments_threshold',
        value: '0',
      });

      const result = await service.getMissingAppointmentsThreshold();

      expect(result).toBe(3);
    });

    it('should return default when value is above maximum', async () => {
      mockRepository.findOne.mockResolvedValue({
        key: 'missing_appointments_threshold',
        value: '11',
      });

      const result = await service.getMissingAppointmentsThreshold();

      expect(result).toBe(3);
    });

    it('should return 1 and 10 when at boundaries', async () => {
      mockRepository.findOne.mockResolvedValue({
        key: 'missing_appointments_threshold',
        value: '1',
      });
      expect(await service.getMissingAppointmentsThreshold()).toBe(1);

      mockRepository.findOne.mockResolvedValue({
        key: 'missing_appointments_threshold',
        value: '10',
      });
      expect(await service.getMissingAppointmentsThreshold()).toBe(10);
    });
  });

  describe('setMissingAppointmentsThreshold', () => {
    it('should persist and return value when in range', async () => {
      const result = await service.setMissingAppointmentsThreshold(5);

      expect(result).toBe(5);
      expect(mockRepository.upsert).toHaveBeenCalledWith(
        {
          key: 'missing_appointments_threshold',
          value: '5',
        },
        { conflictPaths: ['key'] },
      );
    });

    it('should throw when value is below 1', async () => {
      await expect(service.setMissingAppointmentsThreshold(0)).rejects.toThrow(
        'missing_appointments_threshold must be between 1 and 10',
      );
      expect(mockRepository.upsert).not.toHaveBeenCalled();
    });

    it('should throw when value is above 10', async () => {
      await expect(service.setMissingAppointmentsThreshold(11)).rejects.toThrow(
        'missing_appointments_threshold must be between 1 and 10',
      );
      expect(mockRepository.upsert).not.toHaveBeenCalled();
    });

    it('should accept boundary values 1 and 10', async () => {
      await service.setMissingAppointmentsThreshold(1);
      expect(mockRepository.upsert).toHaveBeenCalledWith(
        { key: 'missing_appointments_threshold', value: '1' },
        { conflictPaths: ['key'] },
      );

      mockRepository.upsert.mockClear();
      await service.setMissingAppointmentsThreshold(10);
      expect(mockRepository.upsert).toHaveBeenCalledWith(
        { key: 'missing_appointments_threshold', value: '10' },
        { conflictPaths: ['key'] },
      );
    });
  });
});
