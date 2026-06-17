import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleSettingService } from './../schedule-setting.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScheduleSetting } from '../../entities/schedule-setting.entity';
import { Repository, DeleteResult } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CreateScheduleSettingDto,
  UpdateScheduleSettingDto,
} from '../../dtos/schedule-setting.dto';

describe('ScheduleSettingService', () => {
  let service: ScheduleSettingService;
  let repository: Repository<ScheduleSetting>;

  const mockScheduleSetting = {
    id: 1,
    day_of_week: 1,
    start_time: '09:00',
    end_time: '17:00',
    max_concurrent_assessment: 2,
    max_concurrent_physiotherapy_tens: 3,
    is_active: true,
    created_date: '2025-07-22',
    created_time: '09:00:00',
    updated_date: '2025-07-22',
    updated_time: '09:00:00',
  } as ScheduleSetting;

  const mockRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest
      .fn()
      .mockImplementation((setting) => Promise.resolve({ id: 1, ...setting })),
    find: jest.fn().mockResolvedValue([mockScheduleSetting]),
    findOne: jest.fn().mockResolvedValue(mockScheduleSetting),
    merge: jest.fn().mockImplementation((obj, dto) => ({ ...obj, ...dto })),
    delete: jest
      .fn()
      .mockResolvedValue({ affected: 1, raw: {} } as DeleteResult),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleSettingService,
        {
          provide: getRepositoryToken(ScheduleSetting),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ScheduleSettingService>(ScheduleSettingService);
    repository = module.get<Repository<ScheduleSetting>>(
      getRepositoryToken(ScheduleSetting),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new schedule setting', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);

      const createDto: CreateScheduleSettingDto = {
        day_of_week: 2,
        start_time: '09:00',
        end_time: '17:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 3,
        is_active: true,
      };

      const result = await service.create(createDto);

      expect(result).toEqual({
        id: expect.any(Number),
        ...createDto,
      });
      expect(repository.create).toHaveBeenCalledWith(createDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException when schedule setting for day already exists', async () => {
      const createDto: CreateScheduleSettingDto = {
        day_of_week: 1,
        start_time: '09:00',
        end_time: '17:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 3,
        is_active: true,
      };

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return an array of schedule settings ordered by day_of_week', async () => {
      const result = await service.findAll();

      expect(result).toEqual([mockScheduleSetting]);
      expect(repository.find).toHaveBeenCalledWith({
        order: { day_of_week: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a single schedule setting', async () => {
      const result = await service.findOne(1);

      expect(result).toEqual(mockScheduleSetting);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should throw NotFoundException when schedule setting not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByDay', () => {
    it('should return a schedule setting for a specific day', async () => {
      const result = await service.findByDay(1);

      expect(result).toEqual(mockScheduleSetting);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { day_of_week: 1 },
      });
    });

    it('should throw NotFoundException when no setting exists for the day', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.findByDay(7)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a schedule setting', async () => {
      const updateDto = {
        day_of_week: 1,
        start_time: '10:00',
        end_time: '18:00',
        max_concurrent_assessment: 3,
      } as UpdateScheduleSettingDto;

      const updatedSetting = {
        ...mockScheduleSetting,
        ...updateDto,
      };

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduleSetting);

      jest.spyOn(repository, 'save').mockResolvedValueOnce(updatedSetting);

      const result = await service.update(1, updateDto);

      expect(repository.merge).toHaveBeenCalledWith(
        mockScheduleSetting,
        updateDto,
      );
      expect(repository.save).toHaveBeenCalledWith(mockScheduleSetting);
      expect(result).toEqual(updatedSetting);
    });

    it('should throw BadRequestException when updating to a day that already has settings', async () => {
      const updateDto = {
        day_of_week: 2,
        start_time: '09:00',
        end_time: '17:00',
      } as UpdateScheduleSettingDto;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduleSetting) // First call for findOne(id)
        .mockResolvedValueOnce({ ...mockScheduleSetting, id: 2 }); // Second call for findOne(day_of_week)

      await expect(service.update(1, updateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when schedule setting not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);

      const updateDto = {
        day_of_week: 1,
        start_time: '10:00',
        end_time: '18:00',
      } as UpdateScheduleSettingDto;

      try {
        await service.update(999, updateDto);
        fail('Expected NotFoundException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect(error.message).toBe('Schedule setting with ID 999 not found');
      }
    });

    it('should throw BadRequestException when no fields provided for update', async () => {
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduleSetting);

      const emptyUpdateDto = {} as UpdateScheduleSettingDto;

      await expect(service.update(1, emptyUpdateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should update setting without changing day of week', async () => {
      const updateDto = {
        start_time: '08:00',
        end_time: '16:00',
      } as UpdateScheduleSettingDto;

      const updatedSetting = {
        ...mockScheduleSetting,
        ...updateDto,
      };

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduleSetting);

      jest.spyOn(repository, 'save').mockResolvedValueOnce(updatedSetting);

      const result = await service.update(1, updateDto);

      expect(repository.merge).toHaveBeenCalledWith(
        mockScheduleSetting,
        updateDto,
      );
      expect(repository.save).toHaveBeenCalledWith(mockScheduleSetting);
      expect(result).toEqual(updatedSetting);
    });

    it('should update setting when changing to non-existing day', async () => {
      const updateDto = {
        day_of_week: 3,
        start_time: '09:00',
        end_time: '17:00',
      } as UpdateScheduleSettingDto;

      const updatedSetting = {
        ...mockScheduleSetting,
        ...updateDto,
      };

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduleSetting) // First call for findOne(id)
        .mockResolvedValueOnce(null); // Second call for findOne(day_of_week) - no existing setting

      jest.spyOn(repository, 'save').mockResolvedValueOnce(updatedSetting);

      const result = await service.update(1, updateDto);

      expect(repository.merge).toHaveBeenCalledWith(
        mockScheduleSetting,
        updateDto,
      );
      expect(repository.save).toHaveBeenCalledWith(mockScheduleSetting);
      expect(result).toEqual(updatedSetting);
    });
  });

  describe('remove', () => {
    it('should remove a schedule setting', async () => {
      await service.remove(1);
      expect(repository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when schedule setting not found', async () => {
      jest
        .spyOn(repository, 'delete')
        .mockResolvedValueOnce({ affected: 0, raw: {} } as DeleteResult);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
