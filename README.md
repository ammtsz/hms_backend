# Healthcare Management System – Backend

A production-ready backend for a physiotherapy clinic management system built with NestJS, TypeScript, PostgreSQL, and TypeORM.

Originally developed as a volunteer solution to support healthcare operations in a local community in Brazil, this codebase was adapted into a physiotherapy clinic context to serve as a real-world example of backend system design. The system is developed alongside a frontend that provides the user interface and client-side experience.

---

## Project purpose

The current version of the project focuses on the operational needs of a physiotherapy clinic, including:

- patient registration and tracking
- appointment and appointment workflows
- treatment records and session history
- scheduling rules and return consultations
- holiday-aware scheduling adjustments
- authentication and administrative controls

---

## Architecture & Design

The backend follows core design principles for maintainability and scalability.

### Layered architecture

Controllers handle HTTP requests and validation, services implement business logic, and repositories manage data persistence via TypeORM.

### Security-first approach

Session-based authentication with refresh tokens, password rate limiting, strong validation policies, and environment-based configuration for sensitive data.

### Comprehensive validation

DTOs and decorators validate inputs at the request boundary; services enforce domain-level invariants before persistence.

### Well-documented API

OpenAPI documentation generated from Swagger decorators covering request/response contracts and examples.

### Type safety

Strict TypeScript types enforced across entities, DTOs, and service interfaces.

---

## Tech stack

- NestJS
- TypeScript
- PostgreSQL
- TypeORM
- Docker
- Jest

---

## Main features

### Patient management

Register and maintain patient profiles, record identifiers and contacts, and track clinical history and notes linked to treatments and appointments.

### Scheduling & appointment

Create, view, reschedule and cancel appointments. Includes daily schedules, appointment status tracking, and business rules for booking windows.

### Treatment records & sessions

Persist treatment plans and per-session records with notes, outcomes, and links to attending clinicians and patient history.

### Auto-return scheduling

Automated follow-up scheduling after treatment completion. Rules support configurable intervals and integrate holiday rules to avoid conflicts.

### Holiday management

Manage holidays and reusable templates that affect scheduling. The system can automatically postpone or reschedule affected appointments.

### Schedule settings

Clinic-level configuration for working hours, slot durations, booking thresholds, and other scheduling policies. Currently configurable at the backend level only; no admin UI endpoint is available for updates.

### Dynamic treatment options

Support dynamic creation of treatment types and metadata (e.g., body location) so new therapies can be added without code changes.

### Authentication & security

Session-based authentication with secure refresh token handling, strong password policies, rate limiting on sensitive actions, and first-login password enforcement.

### Validation & error handling

Request validation is enforced with DTOs and decorators; services enforce domain invariants. Errors use structured codes and localized messages to simplify client integration and debugging.

---

## Architecture overview

The backend follows a standard NestJS layered approach:

1. Controller receives the request
2. DTOs validate incoming data
3. Service applies business rules
4. Repository and TypeORM persist data
5. Transformers format responses when needed
6. Controller returns the final response

---

## Project structure

```bash
src/
├── app.controller.ts         # Main application controller
├── app.module.ts             # Root module
├── app.service.ts            # Application service
├── main.ts                   # Application entry point
├── data-source.ts            # TypeORM data source configuration
├── controllers/              # Route controllers
├── services/                 # Business logic services
├── entities/                 # Database models
├── dtos/                     # Data transfer objects
├── transformers/             # Response formatters
├── decorators/               # Custom decorators
├── modules/                  # Feature modules
├── common/                   # Shared utilities, enums, helpers
├── config/                   # Configuration files
├── utils/                    # Utility functions
└── __tests__/                # Automated tests
```

---

## Running locally

1. Install dependencies

   ```bash
   npm install
   ```

2. Create the environment file

   ```bash
   cp .env.example .env
   ```

   Then update the database credentials and other required values.

3. Start the database

   ```bash
   docker-compose up -d
   ```

   The database is initialized using the schema in `init.sql`.

4. Start the development server

   ```bash
   npm run start:dev
   ```

5. Build for production

   ```bash
   npm run build
   npm run start:prod
   ```

---

## Database schema

The canonical schema is defined in `init.sql` and includes:

- patient management tables
- appointment and scheduling tables
- treatment and session tracking
- relationships and constraints
- indexes for performance

---

## Documentation

Additional documentation is available in the docs/ directory:

- [Setup Guide](./docs/SETUP.md) — installation, environment variables, and database operations
- [Architecture](./docs/ARCHITECTURE.md) — stack, project structure, and data flow
- [Authentication](./docs/AUTHENTICATION.md) — JWT, token refresh, and cookie-based auth patterns
- [API Decorators](./docs/API_DECORATORS.md) — Swagger documentation patterns

Start with [docs/README.md](./docs/README.md) for navigation.

---

## Related Projects

- [Frontend App](https://github.com/ammtsz/hms_frontend) — Next.js frontend for clinic workflows
- Frontend docs — `hms-frontend/docs/`
