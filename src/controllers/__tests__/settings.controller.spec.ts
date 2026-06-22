import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from '../settings.controller';
import { SystemOptionService } from '../../services/system-option.service';
import { SystemSettingsService } from '../../services/system-settings.service';
import { SystemOptionType } from '../../entities/system-option.entity';
import { UpdateSystemOptionDto } from '../../dtos/system-option.dto';
import { PatientPriority } from '../../common/enums';
import { BulkUpdatePatientsPriorityDto } from '../../dtos/priority-management.dto';

describe('SettingsController', () => {
  let controller: SettingsController;
  let systemSettingsService: SystemSettingsService;

  const mockSystemOptionService = {
    findAllWithUsageCount: jest.fn(),
    findAll: jest.fn(),
    findSimilar: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deactivatePriority: jest.fn(),
    bulkUpdatePatientsPriority: jest.fn(),
  };

  const mockSystemSettingsService = {
    getMissingAppointmentsThreshold: jest.fn().mockResolvedValue(3),
    setMissingAppointmentsThreshold: jest.fn().mockImplementation((v: number) => Promise.resolve(v)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSystemSettingsService.getMissingAppointmentsThreshold.mockResolvedValue(3);
    mockSystemSettingsService.setMissingAppointmentsThreshold.mockImplementation(
      (v: number) => Promise.resolve(v),
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        {
          provide: SystemOptionService,
          useValue: mockSystemOptionService,
        },
        {
          provide: SystemSettingsService,
          useValue: mockSystemSettingsService,
        },
      ],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);
    systemSettingsService = module.get<SystemSettingsService>(SystemSettingsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAppointmentsThreshold', () => {
    it('should return threshold from system settings', async () => {
      mockSystemSettingsService.getMissingAppointmentsThreshold.mockResolvedValue(5);

      const result = await controller.getAppointmentsThreshold();

      expect(result).toEqual({ missing_appointments_threshold: 5 });
      expect(systemSettingsService.getMissingAppointmentsThreshold).toHaveBeenCalled();
    });

    it('should return default shape when service returns 3', async () => {
      const result = await controller.getAppointmentsThreshold();

      expect(result).toEqual({ missing_appointments_threshold: 3 });
    });
  });

  describe('updateAppointmentsThreshold', () => {
    it('should update threshold and return new value', async () => {
      const dto = { missing_appointments_threshold: 7 };

      const result = await controller.updateAppointmentsThreshold(dto);

      expect(result).toEqual({ missing_appointments_threshold: 7 });
      expect(systemSettingsService.setMissingAppointmentsThreshold).toHaveBeenCalledWith(7);
    });

    it('should propagate error when service throws', async () => {
      mockSystemSettingsService.setMissingAppointmentsThreshold.mockRejectedValue(
        new Error('missing_appointments_threshold must be between 1 and 10'),
      );

      await expect(
        controller.updateAppointmentsThreshold({ missing_appointments_threshold: 0 }),
      ).rejects.toThrow('missing_appointments_threshold must be between 1 and 10');
    });
  });

  describe('priorities', () => {
    it('getPriorities should return priorities with usage count by default', async () => {
      const rows = [{ id: 1, value: '1', type: SystemOptionType.PRIORITY }];
      mockSystemOptionService.findAllWithUsageCount.mockResolvedValue(rows);

      const result = await controller.getPriorities();

      expect(result).toBe(rows);
      expect(
        mockSystemOptionService.findAllWithUsageCount,
      ).toHaveBeenCalledWith(SystemOptionType.PRIORITY, false);
    });

    it('getPriorities should pass includeInactive when all=true', async () => {
      mockSystemOptionService.findAllWithUsageCount.mockResolvedValue([]);

      await controller.getPriorities('true');

      expect(
        mockSystemOptionService.findAllWithUsageCount,
      ).toHaveBeenCalledWith(SystemOptionType.PRIORITY, true);
    });

    it('updatePriorityOption should delegate to system option service', async () => {
      const updated = { id: 2, value: '2' };
      mockSystemOptionService.update.mockResolvedValue(updated);

      const dto: UpdateSystemOptionDto = { label: 'Level 2' };
      const result = await controller.updatePriorityOption('2', dto);

      expect(result).toBe(updated);
      expect(mockSystemOptionService.update).toHaveBeenCalledWith(2, dto);
    });

    it('deactivatePriority should delegate to service', async () => {
      const deactivated = { id: 3, isActive: false };
      mockSystemOptionService.deactivatePriority.mockResolvedValue(deactivated);

      const result = await controller.deactivatePriority('3');

      expect(result).toBe(deactivated);
      expect(mockSystemOptionService.deactivatePriority).toHaveBeenCalledWith(3);
    });

    it('bulkUpdatePatientsPriority should map snake_case dto to service params', async () => {
      mockSystemOptionService.bulkUpdatePatientsPriority.mockResolvedValue({
        updatedCount: 2,
      });

      const bulkDto: BulkUpdatePatientsPriorityDto = {
        patient_ids: [1, 2],
        priority: PatientPriority.LEVEL_2,
      };
      const result = await controller.bulkUpdatePatientsPriority(bulkDto);

      expect(result).toEqual({ updatedCount: 2 });
      expect(
        mockSystemOptionService.bulkUpdatePatientsPriority,
      ).toHaveBeenCalledWith({
        patientIds: [1, 2],
        priorityCode: '2',
      });
    });
  });

  describe('note categories', () => {
    it('getNoteCategories should return categories with usage count by default', async () => {
      const rows = [
        { id: 1, value: 'general', type: SystemOptionType.NOTE_CATEGORY },
      ];
      mockSystemOptionService.findAllWithUsageCount.mockResolvedValue(rows);

      const result = await controller.getNoteCategories();

      expect(result).toBe(rows);
      expect(
        mockSystemOptionService.findAllWithUsageCount,
      ).toHaveBeenCalledWith(SystemOptionType.NOTE_CATEGORY, false);
    });

    it('createNoteCategory should pass dto fields to create', async () => {
      const created = { id: 10, value: 'custom', label: 'Custom' };
      mockSystemOptionService.create.mockResolvedValue(created);

      const result = await controller.createNoteCategory({
        value: 'custom',
        label: 'Custom',
        sort_order: 5,
      });

      expect(result).toBe(created);
      expect(mockSystemOptionService.create).toHaveBeenCalledWith({
        type: SystemOptionType.NOTE_CATEGORY,
        value: 'custom',
        label: 'Custom',
        sort_order: 5,
      });
    });

    it('updateNoteCategory should delegate to update', async () => {
      const updated = { id: 10, label: 'New' };
      mockSystemOptionService.update.mockResolvedValue(updated);

      const patch: UpdateSystemOptionDto = { label: 'New' };
      const result = await controller.updateNoteCategory('10', patch);

      expect(result).toBe(updated);
      expect(mockSystemOptionService.update).toHaveBeenCalledWith(10, patch);
    });

    it('deleteNoteCategory should delete and return message', async () => {
      mockSystemOptionService.delete.mockResolvedValue(undefined);

      const result = await controller.deleteNoteCategory('10');

      expect(mockSystemOptionService.delete).toHaveBeenCalledWith(10);
      expect(result).toEqual({ message: 'Note category deleted successfully' });
    });
  });
});
