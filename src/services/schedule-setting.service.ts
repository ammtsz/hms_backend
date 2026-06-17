import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduleSetting } from '../entities/schedule-setting.entity';
import {
  CreateScheduleSettingDto,
  UpdateScheduleSettingDto,
} from '../dtos/schedule-setting.dto';

@Injectable()
export class ScheduleSettingService {
  constructor(
    @InjectRepository(ScheduleSetting)
    private scheduleSettingRepository: Repository<ScheduleSetting>,
  ) {}

  async create(
    createScheduleSettingDto: CreateScheduleSettingDto,
  ): Promise<ScheduleSetting> {
    const existingSetting = await this.scheduleSettingRepository.findOne({
      where: { day_of_week: createScheduleSettingDto.day_of_week },
    });

    if (existingSetting) {
      throw new BadRequestException(
        `Schedule setting for day ${createScheduleSettingDto.day_of_week} already exists`,
      );
    }

    const setting = this.scheduleSettingRepository.create(
      createScheduleSettingDto,
    );
    return await this.scheduleSettingRepository.save(setting);
  }

  async findAll(): Promise<ScheduleSetting[]> {
    return await this.scheduleSettingRepository.find({
      order: { day_of_week: 'ASC' },
    });
  }

  async findOne(id: number): Promise<ScheduleSetting> {
    const setting = await this.scheduleSettingRepository.findOne({
      where: { id },
    });
    if (!setting) {
      throw new NotFoundException(`Schedule setting with ID ${id} not found`);
    }
    return setting;
  }

  async findByDay(dayOfWeek: number): Promise<ScheduleSetting> {
    const setting = await this.scheduleSettingRepository.findOne({
      where: { day_of_week: dayOfWeek },
    });
    if (!setting) {
      throw new NotFoundException(
        `Schedule setting not found for day ${dayOfWeek}`,
      );
    }
    return setting;
  }

  async update(
    id: number,
    updateScheduleSettingDto: UpdateScheduleSettingDto,
  ): Promise<ScheduleSetting> {
    const setting = await this.findOne(id);

    if (Object.keys(updateScheduleSettingDto).length === 0) {
      throw new BadRequestException(
        'At least one field must be provided for update',
      );
    }

    if (
      updateScheduleSettingDto.day_of_week &&
      updateScheduleSettingDto.day_of_week !== setting.day_of_week
    ) {
      const existingSetting = await this.scheduleSettingRepository.findOne({
        where: { day_of_week: updateScheduleSettingDto.day_of_week },
      });

      if (existingSetting) {
        throw new BadRequestException(
          `Schedule setting for day ${updateScheduleSettingDto.day_of_week} already exists`,
        );
      }
    }

    this.scheduleSettingRepository.merge(setting, updateScheduleSettingDto);
    return await this.scheduleSettingRepository.save(setting);
  }

  async remove(id: number): Promise<void> {
    const result = await this.scheduleSettingRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Schedule setting with ID ${id} not found`);
    }
  }
}
