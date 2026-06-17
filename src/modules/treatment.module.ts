import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Treatment } from '../entities/treatment.entity';
import { Session } from '../entities/session.entity';
import { Consultation } from '../entities/consultation.entity';
import { Attendance } from '../entities/attendance.entity';
import { Patient } from '../entities/patient.entity';
import { TreatmentService } from '../services/treatment.service';
import { TreatmentController } from '../controllers/treatment.controller';
import { AttendanceModule } from './attendance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Treatment,
      Session,
      Consultation,
      Attendance,
      Patient,
    ]),
    forwardRef(() => AttendanceModule),
  ],
  controllers: [TreatmentController],
  providers: [TreatmentService],
  exports: [TreatmentService],
})
export class TreatmentModule {}
