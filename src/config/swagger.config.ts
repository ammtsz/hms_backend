import { DocumentBuilder } from '@nestjs/swagger';

export const swaggerConfig = new DocumentBuilder()
  .setTitle('HMS API')
  .setDescription(
    `The HMS API provides endpoints for managing patient attendances, consultations, treatments (physiotherapy / tens), sessions, and scheduling.

    ## Features
    - Patient Management
    - Attendance Scheduling
    - Consultations (assessment) and treatments with per-date sessions
    - Schedule Settings
    
    ## Authentication
    All endpoints are protected and require a valid authentication token.
    
    ## Rate Limiting
    API calls are limited to 100 requests per minute per IP.`,
  )
  .setVersion('1.0')
  .addBearerAuth()
  .addTag(
    'Attendances',
    'Manage patient attendances including scheduling, check-in, and completion',
  )
  .addTag(
    'Patients',
    'Manage patients including registration and profile data',
  )
  .addTag(
    'Consultations',
    'Assessment consultations per attendance and follow-up',
  )
  .addTag(
    'treatments',
    'Treatments (physiotherapy / tens) and nested sessions',
  )
  .addTag('Schedule Settings', 'Configure daily schedule settings and capacity')
  .setContact(
    'HMS Support',
    'https://hms-frontend.com',
    'support@hms-frontend.com',
  )
  .setLicense('MIT', 'https://opensource.org/licenses/MIT')
  .build();
