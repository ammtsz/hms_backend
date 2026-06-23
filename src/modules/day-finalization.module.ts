import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DayFinalization } from '../entities/day-finalization.entity';
import { DayFinalizationService } from '../services/day-finalization.service';
import { EndOfDayProcessService } from '../services/end-of-day-process.service';
import { DayFinalizationController } from '../controllers/day-finalization.controller';
import { AppointmentModule } from './appointment.module';
import { PatientModule } from './patient.module';
import { TreatmentModule } from './treatment.module';
import { SessionModule } from './session.module';
import { HolidayModule } from './holiday.module';
import { SystemSettingsModule } from './system-settings.module';

/**
 * DayFinalizationModule
 * Handles day finalization functionality - tracking which dates have completed end-of-day processing
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DayFinalization]),
    HolidayModule,
    SystemSettingsModule,
    forwardRef(() => AppointmentModule),
    forwardRef(() => PatientModule),
    forwardRef(() => TreatmentModule),
    SessionModule,
  ],
  controllers: [DayFinalizationController],
  providers: [DayFinalizationService, EndOfDayProcessService],
  exports: [DayFinalizationService],
})
export class DayFinalizationModule {}
