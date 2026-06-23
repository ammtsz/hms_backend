import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from '../entities/patient.entity';
import { PatientNote } from '../entities/patient-note.entity';
import { Appointment } from '../entities/appointment.entity';
import { SystemOption } from '../entities/system-option.entity';
import { PatientController } from '../controllers/patient.controller';
import { PatientService } from '../services/patient.service';
import { PatientNoteService } from '../services/patient-note.service';
import { AppointmentModule } from './appointment.module';
import { TreatmentModule } from './treatment.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Patient, PatientNote, Appointment, SystemOption]),
    AppointmentModule,
    TreatmentModule,
  ],
  controllers: [PatientController],
  providers: [PatientService, PatientNoteService],
  exports: [PatientService, PatientNoteService],
})
export class PatientModule {}
