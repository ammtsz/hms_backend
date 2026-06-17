import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attendance } from '../entities/attendance.entity';
import { Patient } from '../entities/patient.entity';
import { ScheduleSetting } from '../entities/schedule-setting.entity';
import { AttendanceController } from '../controllers/attendance.controller';
import { AttendanceService } from '../services/attendance.service';
import { SessionModule } from './session.module';
import { TreatmentModule } from './treatment.module';
import { HolidayModule } from './holiday.module';
import { DayFinalizationModule } from './day-finalization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attendance, Patient, ScheduleSetting]),
    SessionModule,
    forwardRef(() => TreatmentModule),
    HolidayModule,
    forwardRef(() => DayFinalizationModule),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
