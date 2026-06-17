import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../entities/session.entity';
import { Treatment } from '../entities/treatment.entity';
import { Attendance } from '../entities/attendance.entity';
import { SessionService } from '../services/session.service';
import { SessionController } from '../controllers/session.controller';
import { AttendanceModule } from './attendance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Session,
      Treatment,
      Attendance,
    ]),
    forwardRef(() => AttendanceModule),
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
