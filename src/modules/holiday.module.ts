import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Holiday } from '../entities/holiday.entity';
import { Attendance } from '../entities/attendance.entity';
import { HolidayController } from '../controllers/holiday.controller';
import { HolidayService } from '../services/holiday.service';

/**
 * HolidayModule
 * Handles holiday management functionality - creating, updating, and checking holidays for attendance scheduling
 */
@Module({
  imports: [TypeOrmModule.forFeature([Holiday, Attendance])],
  controllers: [HolidayController],
  providers: [HolidayService],
  exports: [HolidayService],
})
export class HolidayModule {}
