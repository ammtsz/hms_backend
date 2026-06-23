import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HolidayService } from '../holiday.service';
import { Holiday } from '../../entities/holiday.entity';
import { Appointment } from '../../entities/appointment.entity';
import { AppointmentStatus } from '../../common/enums';

describe('HolidayService - Treatment Type Blocking', () => {
  let service: HolidayService;
  let holidayRepository: Repository<Holiday>;
  let appointmentRepository: Repository<Appointment>;

  const mockHolidayRepository = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockAppointmentRepository = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HolidayService,
        {
          provide: getRepositoryToken(Holiday),
          useValue: mockHolidayRepository,
        },
        {
          provide: getRepositoryToken(Appointment),
          useValue: mockAppointmentRepository,
        },
      ],
    }).compile();

    service = module.get<HolidayService>(HolidayService);
    holidayRepository = module.get<Repository<Holiday>>(
      getRepositoryToken(Holiday),
    );
    appointmentRepository = module.get<Repository<Appointment>>(
      getRepositoryToken(Appointment),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isHolidayForTreatment', () => {
    const testDate = '2026-12-25';

    it('should return false when date is not a holiday', async () => {
      mockHolidayRepository.findOne.mockResolvedValue(null);

      const result = await service.isHolidayForTreatment(testDate, 'assessment');

      expect(result).toBe(false);
      expect(mockHolidayRepository.findOne).toHaveBeenCalledWith({
        where: { holiday_date: testDate },
      });
    });

    it('should return true when holiday blocks all treatments (blocked_treatment_types is null)', async () => {
      const holiday = {
        id: 1,
        holiday_date: testDate,
        name: 'Christmas',
        blocked_treatment_types: null,
      };
      mockHolidayRepository.findOne.mockResolvedValue(holiday);

      const result = await service.isHolidayForTreatment(testDate, 'assessment');

      expect(result).toBe(true);
    });

    it('should return true when holiday blocks all treatments (blocked_treatment_types is undefined)', async () => {
      const holiday = {
        id: 1,
        holiday_date: testDate,
        name: 'Christmas',
        blocked_treatment_types: undefined,
      };
      mockHolidayRepository.findOne.mockResolvedValue(holiday);

      const result = await service.isHolidayForTreatment(testDate, 'assessment');

      expect(result).toBe(true);
    });

    it('should return false when holiday blocks no treatments (empty array)', async () => {
      const holiday = {
        id: 1,
        holiday_date: testDate,
        name: 'Christmas',
        blocked_treatment_types: [],
      };
      mockHolidayRepository.findOne.mockResolvedValue(holiday);

      const result = await service.isHolidayForTreatment(testDate, 'assessment');

      expect(result).toBe(false);
    });

    it('should return true when holiday blocks the specific treatment type', async () => {
      const holiday = {
        id: 1,
        holiday_date: testDate,
        name: 'Christmas',
        blocked_treatment_types: ['assessment', 'physiotherapy'],
      };
      mockHolidayRepository.findOne.mockResolvedValue(holiday);

      const result = await service.isHolidayForTreatment(testDate, 'assessment');

      expect(result).toBe(true);
    });

    it('should return false when holiday does not block the specific treatment type', async () => {
      const holiday = {
        id: 1,
        holiday_date: testDate,
        name: 'Christmas',
        blocked_treatment_types: ['physiotherapy', 'tens'],
      };
      mockHolidayRepository.findOne.mockResolvedValue(holiday);

      const result = await service.isHolidayForTreatment(testDate, 'assessment');

      expect(result).toBe(false);
    });

    it('should handle all treatment types correctly', async () => {
      const holiday = {
        id: 1,
        holiday_date: testDate,
        name: 'Christmas',
        blocked_treatment_types: ['assessment'],
      };
      mockHolidayRepository.findOne.mockResolvedValue(holiday);

      expect(await service.isHolidayForTreatment(testDate, 'assessment')).toBe(true);
      expect(await service.isHolidayForTreatment(testDate, 'physiotherapy')).toBe(false);
      expect(await service.isHolidayForTreatment(testDate, 'tens')).toBe(false);
    });
  });

  describe('isHoliday (backward compatibility)', () => {
    const testDate = '2026-12-25';

    it('should return false when date is not a holiday', async () => {
      mockHolidayRepository.findOne.mockResolvedValue(null);

      const result = await service.isHoliday(testDate);

      expect(result).toBe(false);
    });

    it('should return true when date is a holiday (regardless of blocked types)', async () => {
      const holiday = {
        id: 1,
        holiday_date: testDate,
        name: 'Christmas',
        blocked_treatment_types: ['assessment'], // specific blocking
      };
      mockHolidayRepository.findOne.mockResolvedValue(holiday);

      const result = await service.isHoliday(testDate);

      expect(result).toBe(true);
    });
  });

  describe('checkConflicts - only open appointments block', () => {
    const testDate = '2026-06-15';
    let queryBuilderChain: {
      leftJoinAndSelect: jest.Mock;
      where: jest.Mock;
      andWhere: jest.Mock;
      orderBy: jest.Mock;
      getMany: jest.Mock;
    };

    beforeEach(() => {
      queryBuilderChain = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockAppointmentRepository.createQueryBuilder.mockReturnValue(queryBuilderChain);
    });

    it('should only consider scheduled, checked_in, in_progress (open statuses)', async () => {
      await service.checkConflicts(testDate);

      expect(queryBuilderChain.andWhere).toHaveBeenCalledWith(
        'appointment.status IN (:...openStatuses)',
        {
          openStatuses: [
            AppointmentStatus.SCHEDULED,
            AppointmentStatus.CHECKED_IN,
            AppointmentStatus.IN_PROGRESS,
          ],
        },
      );
    });

    it('should return no conflict when no open appointments on date', async () => {
      queryBuilderChain.getMany.mockResolvedValue([]);

      const result = await service.checkConflicts(testDate);

      expect(result.hasConflict).toBe(false);
      expect(result.appointmentCount).toBe(0);
      expect(result.appointments).toEqual([]);
    });

    it('should return conflict when open appointments exist on date', async () => {
      const appointments = [
        {
          id: 1,
          patient: { name: 'Patient A' },
          type: 'assessment',
        },
      ];
      queryBuilderChain.getMany.mockResolvedValue(appointments);

      const result = await service.checkConflicts(testDate);

      expect(result.hasConflict).toBe(true);
      expect(result.appointmentCount).toBe(1);
      expect(result.appointments).toEqual([
        { id: 1, patient_name: 'Patient A', treatment_type: 'assessment' },
      ]);
    });
  });
});