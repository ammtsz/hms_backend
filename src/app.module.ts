import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './modules/database.module';
import { PatientModule } from './modules/patient.module';
import { AppointmentModule } from './modules/appointment.module';
import { ConsultationModule } from './modules/consultation.module';
import { TreatmentModule } from './modules/treatment.module';
import { SessionModule } from './modules/session.module';
import { ScheduleSettingModule } from './modules/schedule-setting.module';
import { DayFinalizationModule } from './modules/day-finalization.module';
import { HolidayModule } from './modules/holiday.module';
import { HolidayTemplateModule } from './modules/holiday-template.module';
import { SettingsModule } from './modules/settings.module';
import { AuthModule } from './modules/auth.module';
import { UserModule } from './modules/user.module';
import { AppThrottlerGuard } from './common/guards/throttler.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production' ? '.env' : '.env.local',
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60),
          limit: config.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
    }),
    DatabaseModule,
    AuthModule,
    UserModule,
    PatientModule,
    AppointmentModule,
    ConsultationModule,
    TreatmentModule,
    SessionModule,
    ScheduleSettingModule,
    DayFinalizationModule,
    HolidayModule,
    HolidayTemplateModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppThrottlerGuard,
    // Global JWT guard — every route requires authentication by default (M1).
    // Decorate public routes with @Public() to opt out.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
