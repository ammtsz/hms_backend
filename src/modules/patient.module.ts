import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from '../entities/patient.entity';
import { PatientNote } from '../entities/patient-note.entity';
import { Attendance } from '../entities/attendance.entity';
import { SystemOption } from '../entities/system-option.entity';
import { PatientController } from '../controllers/patient.controller';
import { PatientService } from '../services/patient.service';
import { PatientNoteService } from '../services/patient-note.service';
import { AttendanceModule } from './attendance.module';
import { TreatmentModule } from './treatment.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Patient, PatientNote, Attendance, SystemOption]),
    AttendanceModule,
    TreatmentModule,
  ],
  controllers: [PatientController],
  providers: [PatientService, PatientNoteService],
  exports: [PatientService, PatientNoteService],
})
export class PatientModule {}
