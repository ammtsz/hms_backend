import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceController } from '../attendance.controller';
import { AttendanceService } from '../../services/attendance.service';
import {
  CreateAttendanceDto,
  UpdateAttendanceDto,
} from '../../dtos/attendance.dto';
import { AttendanceType, AttendanceStatus } from '../../common/enums';
import { ResourceNotFoundException } from '../../common/exceptions';

describe('AttendanceController', () => {
  let controller: AttendanceController;
  let service: AttendanceService;

  const mockAttendance = {
    id: 1,
    patient_id: 1,
    type: AttendanceType.ASSESSMENT,
    status: AttendanceStatus.SCHEDULED,
    scheduled_date: '2025-07-22',
    scheduled_time: '14:30',
    checked_in_time: undefined,
    started_time: undefined,
    completed_time: undefined,
    cancelled_date: undefined,
    cancelled_time: undefined,
    notes: 'Test notes',
    created_at: '2025-07-22T09:00:00',
    updated_at: '2025-07-22T09:00:00',
  };

  const mockAttendanceService = {
    create: jest.fn((dto) =>
      Promise.resolve({
        id: 1,
        ...dto,
        type: AttendanceType.ASSESSMENT,
        status: AttendanceStatus.SCHEDULED,
        created_at: '2025-07-22T09:00:00',
        updated_at: '2025-07-22T09:00:00',
      }),
    ),
    findAll: jest.fn(() =>
      Promise.resolve([
        {
          id: 1,
          patient_id: 1,
          type: AttendanceType.ASSESSMENT,
          status: AttendanceStatus.SCHEDULED,
          scheduled_date: '2025-07-22',
          scheduled_time: '14:30',
          checked_in_time: undefined,
          started_time: undefined,
          completed_time: undefined,
          cancelled_date: undefined,
          cancelled_time: undefined,
          notes: 'Test notes',
          created_date: '2025-07-22',
          created_time: '09:00:00',
          updated_date: '2025-07-22',
          updated_time: '09:00:00',
        },
      ]),
    ),
    findAllForSchedule: jest.fn(() =>
      Promise.resolve([
        {
          attendance_id: 1,
          attendance_patient_id: 1,
          attendance_type: 'assessment',
          attendance_status: 'scheduled',
          attendance_scheduled_date: '2025-07-22',
          attendance_notes: 'Test notes',
          patient_name: 'John Doe',
          patient_priority: '2',
        },
      ]),
    ),
    findNextScheduledDate: jest.fn(() => Promise.resolve('2025-07-23')),
    getAttendanceStats: jest.fn(() =>
      Promise.resolve({
        total: 5,
        scheduled: 2,
        checked_in: 1,
        in_progress: 1,
        completed: 1,
        cancelled: 0,
        by_type: { assessment: 3, physiotherapy: 2, tens: 0 },
      }),
    ),
    findOne: jest.fn(() =>
      Promise.resolve({
        id: 1,
        patient_id: 1,
        patient: null,
        type: AttendanceType.ASSESSMENT,
        status: AttendanceStatus.SCHEDULED,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
        created_at: '2025-07-22T09:00:00',
        updated_at: '2025-07-22T09:00:00',
        checked_in_time: null,
        started_time: null,
        completed_time: null,
        cancelled_date: null,
        cancelled_time: null,
      }),
    ),
    update: jest.fn((id, dto) => Promise.resolve({ id, ...dto })),
    cancel: jest.fn(() => Promise.resolve(undefined)),
    findEligibleParentOptions: jest.fn(() =>
      Promise.resolve({
        options: [
          {
            id: 1,
            date: '2025-07-22',
            main_concern: 'Back pain',
            label: '2025-07-22 - Back pain',
          },
        ],
      }),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        {
          provide: AttendanceService,
          useValue: mockAttendanceService,
        },
      ],
    }).compile();

    controller = module.get<AttendanceController>(AttendanceController);
    service = module.get<AttendanceService>(AttendanceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new attendance', async () => {
      const createDto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      const result = await controller.create(createDto);

      expect(result).toMatchObject({
        id: expect.any(Number),
        ...createDto,
      });
      expect(service.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('findAll', () => {
    it('should return an array of attendances', async () => {
      const result = await controller.findAll();

      expect(result).toEqual([mockAttendance]);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single attendance', async () => {
      const result = await controller.findOne('1');

      expect(result).toMatchObject({
        id: 1,
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        status: AttendanceStatus.SCHEDULED,
        scheduled_time: '14:30',
        notes: 'Test notes',
      });
      expect(service.findOne).toHaveBeenCalledWith(1);
    });

    it('should throw ResourceNotFoundException when attendance not found', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(null);

      await expect(controller.findOne('999')).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update an attendance', async () => {
      const updateDto: UpdateAttendanceDto = {
        notes: 'Updated notes',
      };

      const result = await controller.update('1', updateDto);

      expect(result).toMatchObject({
        id: 1,
        ...updateDto,
      });
      expect(service.update).toHaveBeenCalledWith(1, updateDto);
    });

    it('should throw ResourceNotFoundException when attendance not found for update', async () => {
      jest.spyOn(service, 'update').mockResolvedValueOnce(null);

      const updateDto: UpdateAttendanceDto = {
        notes: 'Updated notes',
      };

      await expect(controller.update('999', updateDto)).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  describe('cancel', () => {
    it('should cancel an attendance', async () => {
      const result = await controller.cancel('1', {});

      expect(result).toEqual(undefined);
      expect(service.cancel).toHaveBeenCalledWith(1, undefined);
    });

    it('should throw ResourceNotFoundException when attendance not found', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(null);

      await expect(controller.cancel('999')).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  describe('findAllForSchedule', () => {
    it('should return schedule attendances without filters', async () => {
      const result = await controller.findAllForSchedule();

      expect(result).toEqual([
        {
          id: 1,
          patient_id: 1,
          type: 'assessment',
          status: 'scheduled',
          scheduled_date: '2025-07-22',
          notes: 'Test notes',
          patient_name: 'John Doe',
          patient_priority: '2',
        },
      ]);
      expect(service.findAllForSchedule).toHaveBeenCalledWith({
        statuses: undefined,
        type: undefined,
        limit: undefined,
        fromDate: undefined,
        toDate: undefined,
      });
    });

    it('should return schedule attendances with filters', async () => {
      const result = await controller.findAllForSchedule(
        'scheduled',
        'assessment',
        '10',
        '2025-07-01',
        '2025-07-31',
      );

      expect(result).toEqual([
        {
          id: 1,
          patient_id: 1,
          type: 'assessment',
          status: 'scheduled',
          scheduled_date: '2025-07-22',
          notes: 'Test notes',
          patient_name: 'John Doe',
          patient_priority: '2',
        },
      ]);
      expect(service.findAllForSchedule).toHaveBeenCalledWith({
        statuses: [AttendanceStatus.SCHEDULED],
        type: 'assessment',
        limit: 10,
        fromDate: '2025-07-01',
        toDate: '2025-07-31',
      });
    });

    it('should pass multiple status query values', async () => {
      await controller.findAllForSchedule(
        ['scheduled', 'completed'],
        undefined,
        undefined,
        '2025-07-01',
        '2025-07-15',
      );

      expect(service.findAllForSchedule).toHaveBeenCalledWith({
        statuses: [AttendanceStatus.SCHEDULED, AttendanceStatus.COMPLETED],
        type: undefined,
        limit: undefined,
        fromDate: '2025-07-01',
        toDate: '2025-07-15',
      });
    });

    it('should omit statuses when none valid after parse', async () => {
      await controller.findAllForSchedule(
        ['not-a-status'],
        undefined,
        undefined,
        '2025-07-01',
        '2025-07-15',
      );

      expect(service.findAllForSchedule).toHaveBeenCalledWith({
        statuses: undefined,
        type: undefined,
        limit: undefined,
        fromDate: '2025-07-01',
        toDate: '2025-07-15',
      });
    });

    it('should handle invalid limit parameter gracefully', async () => {
      await controller.findAllForSchedule(
        undefined,
        undefined,
        'invalid',
        '2025-07-01',
        '2025-07-15',
      );

      expect(service.findAllForSchedule).toHaveBeenCalledWith({
        statuses: undefined,
        type: undefined,
        limit: undefined,
        fromDate: '2025-07-01',
        toDate: '2025-07-15',
      });
    });
  });

  describe('getNextScheduledDate', () => {
    it('should return next scheduled date', async () => {
      const result = await controller.getNextScheduledDate();

      expect(result).toEqual({
        next_date: '2025-07-23',
      });
      expect(service.findNextScheduledDate).toHaveBeenCalled();
    });

    it('should handle null response from service', async () => {
      jest.spyOn(service, 'findNextScheduledDate').mockResolvedValueOnce(null);

      const result = await controller.getNextScheduledDate();

      expect(result).toEqual({
        next_date: expect.any(String), // Should fallback to today's date
      });
    });

    it('should handle service errors properly', async () => {
      const error = new Error('Database connection failed');
      jest.spyOn(service, 'findNextScheduledDate').mockRejectedValueOnce(error);

      await expect(controller.getNextScheduledDate()).rejects.toThrow(error);
    });
  });

  describe('getAttendanceStats', () => {
    it('should return attendance statistics for default date (today)', async () => {
      const result = await controller.getAttendanceStats();

      expect(result).toEqual({
        total: 5,
        scheduled: 2,
        checked_in: 1,
        in_progress: 1,
        completed: 1,
        cancelled: 0,
        by_type: { assessment: 3, physiotherapy: 2, tens: 0 },
      });
      expect(service.getAttendanceStats).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), // Today's date in YYYY-MM-DD format
      );
    });

    it('should return attendance statistics for specific date', async () => {
      const testDate = '2025-07-22';
      const result = await controller.getAttendanceStats(testDate);

      expect(result).toEqual({
        total: 5,
        scheduled: 2,
        checked_in: 1,
        in_progress: 1,
        completed: 1,
        cancelled: 0,
        by_type: { assessment: 3, physiotherapy: 2, tens: 0 },
      });
      expect(service.getAttendanceStats).toHaveBeenCalledWith(testDate);
    });

    it('should handle empty statistics', async () => {
      const emptyStats = {
        total: 0,
        scheduled: 0,
        checked_in: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
        by_type: { assessment: 0, physiotherapy: 0, tens: 0 },
      };

      jest
        .spyOn(service, 'getAttendanceStats')
        .mockResolvedValueOnce(emptyStats);

      const result = await controller.getAttendanceStats('2025-12-25');

      expect(result).toEqual(emptyStats);
    });

    it('should handle service errors', async () => {
      const error = new Error('Database error');
      jest.spyOn(service, 'getAttendanceStats').mockRejectedValueOnce(error);

      await expect(controller.getAttendanceStats('2025-07-22')).rejects.toThrow(
        error,
      );
    });
  });

  describe('getEligibleParentOptions', () => {
    it('should return eligible parent options for patient', async () => {
      const result = await controller.getEligibleParentOptions('1');

      expect(result).toEqual({
        options: [
          {
            id: 1,
            date: '2025-07-22',
            main_concern: 'Back pain',
            label: '2025-07-22 - Back pain',
          },
        ],
      });
      expect(service.findEligibleParentOptions).toHaveBeenCalledWith(1);
    });

    it('should return empty options when patient has no eligible roots', async () => {
      jest.spyOn(service, 'findEligibleParentOptions').mockResolvedValueOnce({
        options: [],
      });

      const result = await controller.getEligibleParentOptions('42');

      expect(result).toEqual({ options: [] });
      expect(service.findEligibleParentOptions).toHaveBeenCalledWith(42);
    });
  });
});
