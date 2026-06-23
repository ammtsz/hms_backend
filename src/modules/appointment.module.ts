import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../entities/appointment.entity';
import { Patient } from '../entities/patient.entity';
import { ScheduleSetting } from '../entities/schedule-setting.entity';
import { AppointmentController } from '../controllers/appointment.controller';
import { AppointmentService } from '../services/appointment.service';
import { SessionModule } from './session.module';
import { TreatmentModule } from './treatment.module';
import { HolidayModule } from './holiday.module';
import { DayFinalizationModule } from './day-finalization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Patient, ScheduleSetting]),
    SessionModule,
    forwardRef(() => TreatmentModule),
    HolidayModule,
    forwardRef(() => DayFinalizationModule),
  ],
  controllers: [AppointmentController],
  providers: [AppointmentService],
  exports: [AppointmentService],
})
export class AppointmentModule {}
