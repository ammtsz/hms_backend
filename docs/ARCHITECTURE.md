# Backend Architecture

## Technology Stack

### Core Framework

- **Framework**: [NestJS](https://docs.nestjs.com/) (Node.js/Express)
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 18+

### Database

- **Database**: PostgreSQL 14+
- **ORM**: [TypeORM](https://typeorm.io/)
- **Migrations**: TypeORM CLI
- **Schema**: SQL-based (canonical schema in `init.sql`)

### Validation & Serialization

- **DTOs**: Data Transfer Objects with class-validator
- **Validation**: Decorators + class-validator for input validation
- **Transformers**: Data transformation layer for API responses

### Documentation & Testing

- **API Documentation**: Swagger/OpenAPI via `@nestjs/swagger`
- **Testing**: Jest
- **E2E Testing**: Jest with supertest

### Deployment

- **Platform**: Railway
- **Environment**: Node.js 18+ required
- **External Services**: PostgreSQL (via Railway or self-hosted)

## Project Structure

```
src/
├── main.ts                 # Application entry point
├── app.module.ts           # Root module
├── app.controller.ts       # Root controller
├── app.service.ts          # Root service
├── data-source.ts          # TypeORM data source config
│
├── common/                 # Shared utilities
│   ├── decorators/         # Cross-cutting decorators
│   ├── exceptions/         # Custom exceptions
│   ├── filters/            # Exception filters
│   ├── guards/             # Auth and request guards
│   ├── strategies/         # Passport strategies
│   ├── utils/              # Shared utility functions
│   └── validators/         # Reusable validation helpers
│
├── config/                 # Configuration
│   └── swagger.config.ts
│
├── decorators/             # Custom decorators
│   ├── api-*.decorator.ts  # Swagger API decorators
│   └── custom.decorator.ts # Custom logic decorators
│
├── dtos/                   # Data Transfer Objects
│   └── [feature]/
│       ├── create-*.dto.ts
│       ├── update-*.dto.ts
│       └── *.dto.ts
│
├── entities/               # TypeORM entities (database models)
│   └── [domain]/
│       ├── patient.entity.ts
│       ├── appointment.entity.ts
│       ├── treatment.entity.ts
│       └── session.entity.ts
│
├── modules/                # Feature modules (NestJS organization)
│   ├── patients/
│   ├── appointments/
│   └── [feature]/
│
├── controllers/            # HTTP request handlers
│   └── *.controller.ts     # appointment, auth, consultation, treatment, etc.
│
├── services/               # Business logic
│   └── *.service.ts        # feature services and orchestration
│
├── transformers/           # Response data transformation
│   └── *.transformer.ts
│
└── utils/                  # Shared utilities
    ├── date-string-helpers.ts
    ├── validators.ts
    └── helpers.ts
```

## Data Flow

### Request → Response Cycle

1. **HTTP Request** arrives at Controller
2. **Controller** validates request with DTO (class-validator)
3. **Service** processes business logic (data access, calculations)
4. **Repository** (TypeORM) executes database queries
5. **Transformer** formats entity data for API response
6. **Controller** returns HTTP response with proper status code

### Example: Creating a Treatment

```
POST /treatments
  ↓
TreatmentController.create()
  ↓ validates CreateTreatmentDto
  ↓
TreatmentService.create()
  ↓ calls repository methods
  ↓
TypeORM Repository
  ↓ INSERT INTO treatment...
  ↓ Database
  ↓
TreatmentTransformer.toDTO()
  ↓ formats response
  ↓
HTTP 201 Created + body
```

## Date and Time Handling

### Timezone-Agnostic Dates

Scheduling dates (`scheduled_date`) and times (`scheduled_time`) are stored as **timezone-agnostic strings**:

- **`scheduled_date`**: Stored as `VARCHAR(10)` in `YYYY-MM-DD` format (not DATE type)
- **`scheduled_time`**: Stored as `TIME` type in `HH:MM:SS` format

**Why?** Users schedule treatments for specific calendar days (e.g., "every Tuesday") regardless of server timezone. Using strings prevents JavaScript Date object UTC conversion issues that could shift dates unexpectedly.

### Audit Timestamps

Event-based timestamps remain as `TIMESTAMP` with timezone awareness for audit trails:

- `checked_in_at`, `started_at`, `completed_at`, `cancelled_at`
- `created_at`, `updated_at`

These capture the exact moment of events and should preserve precision for auditing.

### Frontend Integration

The frontend and backend communicate with these date formats:

- Schedule queries use string format: `"2026-06-12"`
- Responses send string dates: `"scheduled_date": "2026-06-15"`
- No Date object conversions needed in API layer

### Physiotherapy domain model

| Entity / area | Key fields | Rules |
|---------------|------------|-------|
| `hms_consultation` | `home_exercises`, `pain_management`, `medications` | Replaced legacy `food`, `water`, `ointments` columns |
| `hms_treatment` | `treatment_type` (`physiotherapy` \| `tens`), `body_location`, `duration_minutes` | `duration_minutes` NOT NULL, CHECK IN (30, 45, 60) |
| Scheduling signature | Body location + patient + date | `scheduling-signature.utils.ts` |
| Constants | `TREATMENT_SESSION_DURATIONS`, defaults 45 / 30 | `src/common/constants/treatment.constants.ts` |

DTOs and entities mirror these names in camelCase at the API boundary. Recreate databases from `init.sql` after schema changes (no migration path for the 2026 physiotherapy refactor).

### Authentication & Authorization

- **Strategy**: JWT-based with refresh tokens
- **Access Token**: 8-hour expiry
- **Refresh Token**: 7-day expiry
- **BFF Pattern**: Next.js server actions and API routes call backend auth endpoints using the `x-bff-secret` header when configured
- **Cookies**: httpOnly cookies for access and refresh tokens are set by the frontend server

See [AUTHENTICATION.md](./AUTHENTICATION.md) for detailed flow.

## API Documentation Patterns

Custom Swagger decorators provide consistent API documentation:

- `@ApiConsultationOperation()` — Consultation endpoints
- `@ApiTreatmentOperation()` — Treatment endpoints
- `@ApiSessionOperation()` — Session endpoints

See [API_DECORATORS.md](./API_DECORATORS.md) for full reference.

## Error Handling

### Exception Filters

Standardized HTTP error responses:

- `BadRequestException` → 400
- `UnauthorizedException` → 401
- `ForbiddenException` → 403
- `NotFoundException` → 404
- `ConflictException` → 409 (duplicate records, business logic violations)
- `InternalServerErrorException` → 500

### Validation Errors

DTO validation failures return 400 with detailed field-level errors from class-validator.

## Testing

### Unit Tests

Test individual services, transformers, and utilities in isolation:

```bash
npm test -- src/services/treatments.service.spec.ts
```

### E2E Tests

Test complete request/response cycles:

```bash
npm test -- test/app.e2e-spec.ts
```

### Coverage

Run all tests with coverage report:

```bash
npm test -- --coverage
```

The current coverage report is generated by Jest and may change as the codebase evolves.

## Deployment

### Environment

- **Platform**: Railway
- **Node version**: 18+
- **Database**: PostgreSQL 14+

### Configuration

See [SETUP.md](./SETUP.md) for required environment variables.

### Migrations

This repository does not use a standalone migration runner script.
The canonical schema lives in `init.sql`, and Docker initializes the database from that file.
For local resets, use `./reset-database.sh` or recreate the database container.

For Railway or production databases, update `init.sql` and reinitialize the database when needed.

---

**API Docs**: `/api` endpoint (when running)  
**Health Check**: `GET /` returns OK  
**Related Docs**: [AUTHENTICATION.md](./AUTHENTICATION.md), [API_DECORATORS.md](./API_DECORATORS.md)
