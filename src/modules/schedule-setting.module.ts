import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleSetting } from '../entities/schedule-setting.entity';
import { ScheduleSettingController } from '../controllers/schedule-setting.controller';
import { ScheduleSettingService } from '../services/schedule-setting.service';

@Module({
  imports: [TypeOrmModule.forFeature([ScheduleSetting])],
  controllers: [ScheduleSettingController],
  providers: [ScheduleSettingService],
  exports: [ScheduleSettingService],
})
export class ScheduleSettingModule {}
