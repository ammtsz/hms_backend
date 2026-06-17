# API Decorators

Swagger helpers for the current API controllers in the backend.

## Vocabulary

- **Attendance** — scheduled or in-progress visit record (`hms_attendance`). Routes: `/attendances`.
- **Consultation** — assessment visit record (`hms_consultation`). Routes: `/consultations`.
- **Patient** — registered person receiving care (`hms_patient`). Routes: `/patients`.
- **Schedule setting** — daily capacity and time window configuration (`hms_schedule_setting`). Routes: `/schedule-settings`.
- **Treatment** — physiotherapy or tens plan (`hms_treatment`). Routes: `/treatments`.
- **Session** — scheduled occurrence (`hms_session`). Routes: `/sessions`.

## Decorator Groups

### Attendance Decorators

**File:** `src/decorators/api-attendance.decorator.ts`

| Decorator                         | Role                                               |
| --------------------------------- | -------------------------------------------------- |
| `ApiAttendanceOperation(summary)` | Shared responses for generic attendance operations |
| `ApiCreateAttendanceOperation()`  | `POST /attendances` — create attendance            |
| `ApiUpdateAttendanceOperation()`  | `PUT /attendances/:id` — update attendance         |

### Patient Decorators

**File:** `src/decorators/api-patient.decorator.ts`

| Decorator                       | Role                                                |
| ------------------------------- | --------------------------------------------------- |
| `ApiPatientOperation(summary)`  | Shared responses for generic patient GET operations |
| `ApiCreatePatientOperation()`   | `POST /patients` — create patient                   |
| `ApiUpdatePatientOperation()`   | `PUT /patients/:id` — update patient                |
| `ApiDeletePatientOperation()`   | `DELETE /patients/:id` — delete patient             |
| `ApiFindAllPatientsOperation()` | `GET /patients`                                     |
| `ApiFindOnePatientOperation()`  | `GET /patients/:id`                                 |

### Schedule Setting Decorators

**File:** `src/decorators/api-schedule-setting.decorator.ts`

| Decorator                              | Role                                                         |
| -------------------------------------- | ------------------------------------------------------------ |
| `ApiScheduleSettingOperation(summary)` | Shared responses for generic schedule-setting GET operations |
| `ApiCreateScheduleSettingOperation()`  | `POST /schedule-settings` — create schedule setting          |
| `ApiUpdateScheduleSettingOperation()`  | `PUT /schedule-settings/:id` — update schedule setting       |

## Consultation Decorators

**File:** `src/decorators/api-consultation.decorator.ts`

| Decorator                                    | Role                                                 |
| -------------------------------------------- | ---------------------------------------------------- |
| `ApiConsultationOperation(summary)`          | Shared responses for generic consultation operations |
| `ApiCreateConsultationOperation()`           | `POST /consultations` — create consultation          |
| `ApiUpdateConsultationOperation()`           | `PUT /consultations/:id` — update consultation       |
| `ApiDeleteConsultationOperation()`           | `DELETE /consultations/:id` — delete consultation    |
| `ApiFindAllConsultationsOperation()`         | `GET /consultations`                                 |
| `ApiFindOneConsultationOperation()`          | `GET /consultations/:id`                             |
| `ApiFindConsultationByAttendanceOperation()` | `GET /consultations/attendance/:attendanceId`        |

## Treatment Decorators

**File:** `src/decorators/api-treatment.decorator.ts`

| Decorator                                   | Role                                                           |
| ------------------------------------------- | -------------------------------------------------------------- |
| `ApiTreatmentOperation(summary)`            | Shared responses for generic treatment GET/POST operations     |
| `ApiCreateTreatmentOperation()`             | `POST /treatments` — create treatment                          |
| `ApiUpdateTreatmentOperation()`             | `PUT /treatments/:id` — update treatment                       |
| `ApiDeleteTreatmentOperation()`             | `DELETE /treatments/:id` — delete treatment (sessions cascade) |
| `ApiGetTreatmentsByPatientOperation()`      | `GET /treatments/patient/:patientId`                           |
| `ApiGetTreatmentsByConsultationOperation()` | `GET /treatments/consultation/:consultationId`                 |
| `ApiGetTreatmentStatsOperation()`           | `GET /treatments/patient/:patientId/stats`                     |

## Session Decorators

**File:** `src/decorators/api-session.decorator.ts`

| Decorator                              | Role                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `ApiSessionOperation(summary)`         | Shared responses for session GET operations with a custom summary      |
| `ApiCreateSessionOperation()`          | `POST /sessions` — create session                                      |
| `ApiUpdateSessionOperation()`          | `PUT /sessions/:id` — update session                                   |
| `ApiDeleteSessionOperation()`          | `DELETE /sessions/:id` — delete session                                |
| `ApiGetSessionsByTreatmentOperation()` | `GET /sessions/treatment/:treatmentId` — list sessions for a treatment |
| `ApiCompleteSessionOperation()`        | `POST /sessions/:id/complete`                                          |

## Usage Examples

### Consultation Endpoint

```typescript
@ApiTags('consultations')
@Controller('consultations')
export class ConsultationController {
  @Get(':id')
  @ApiFindOneConsultationOperation()
  getOne(@Param('id') id: number) {
    /* implementation */
  }
}
```

### Treatment Endpoint

```typescript
@ApiTags('treatments')
@Controller('treatments')
export class TreatmentController {
  @Get(':id')
  @ApiTreatmentOperation('Get treatment by ID')
  getOne(@Param('id') id: number) {
    /* implementation */
  }
}
```

### Session Endpoint

```typescript
@ApiTags('sessions')
@Controller('sessions')
export class SessionController {
  @Post()
  @ApiCreateSessionOperation()
  create(@Body() dto: CreateSessionDto) {
    /* implementation */
  }
}
```

## Testing

Decorator tests are located in:

- `src/decorators/__tests__/api-attendance.decorator.spec.ts`
- `src/decorators/__tests__/api-patient.decorator.spec.ts`
- `src/decorators/__tests__/api-consultation.decorator.spec.ts`
- `src/decorators/__tests__/api-treatment.decorator.spec.ts`
- `src/decorators/__tests__/api-session.decorator.spec.ts`

Run decorator tests with:

```bash
npm test -- src/decorators/__tests__
```

## Related Files

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Project structure and patterns
- [AUTHENTICATION.md](./AUTHENTICATION.md) — Auth flow and JWT details
