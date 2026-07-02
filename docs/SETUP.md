# Backend Setup Guide

## Environment Variables

Add these variables to your `.env.local` (development) or Railway environment (production):

```bash
# JWT Configuration
# Generate strong secrets: openssl rand -base64 32
# Minimum 32 characters required for production
JWT_SECRET=CHANGE_ME_use_openssl_rand_base64_32_to_generate
JWT_REFRESH_SECRET=CHANGE_ME_use_openssl_rand_base64_32_to_generate

# BFF internal secret — required in production; must match frontend BFF_INTERNAL_SECRET
BFF_INTERNAL_SECRET=CHANGE_ME_use_openssl_rand_base64_32_to_generate

# CORS Configuration (Important for cookie-based auth)
CORS_ORIGIN=http://localhost:3000

# Clinic timezone for calendar "today" (IANA, e.g. America/Vancouver)
CLINIC_TIMEZONE=America/Vancouver
```

Set the same value as frontend `NEXT_PUBLIC_CLINIC_TIMEZONE`.

### Security Notes

1. **JWT_SECRET**: Used for access tokens (8 hour expiry)
   - Should be at least 32 characters
   - Use a cryptographically secure random string
   - Never commit to git

2. **BFF_INTERNAL_SECRET**: Shared with the Next.js server (Vercel). Required in
   production so `POST /auth/login`, `POST /auth/refresh`, and `POST /auth/logout`
   reject callers without the `x-bff-secret` header. Optional in local development
   when unset on both apps.

3. **JWT_REFRESH_SECRET**: Used for refresh tokens (7 day expiry)
   - Should be different from JWT_SECRET
   - Should be at least 32 characters
   - Never commit to git

### Generate Secure Secrets

Use one of these methods to generate secure secrets:

```bash
# Recommended: OpenSSL (base64)
openssl rand -base64 32

# Alternative: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Installation

```bash
# Install dependencies
npm install

# Start the PostgreSQL container
docker-compose up -d

# Wait for database to be ready (typically 5-10 seconds)
sleep 10

# Start development server
npm run start:dev
```

The backend will be available at `http://localhost:3002` with API docs at `/api`.

The database schema is initialized from `init.sql` when Docker starts the PostgreSQL container.

> **Physiotherapy domain schema (2026):** `init.sql` / `railway-init.sql` define consultation fields `home_exercises`, `pain_management`, `medications`; treatment `duration_minutes` (30 / 45 / 60, required). Existing local DBs from older schemas must be **reset** (`./reset-database.sh` or `docker-compose down -v`) — there are no incremental migrations for this change.

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm test -- --coverage

# Run a specific test file
npm test -- src/__tests__/app.controller.spec.ts

# Watch mode (re-run on file changes)
npm test -- --watch
```

## Database Operations

### Connect to Database

```bash
# Connect using Docker
docker-compose exec postgres psql -U user -d database

# Or use a database client (DBeaver, pgAdmin, etc.)
# Host: localhost | Port: 5432 | User: user | Password: user
```

### View Logs

```bash
# View PostgreSQL logs
docker-compose logs postgres

# Follow logs in real-time
docker-compose logs -f postgres
```

### Reset Database

```bash
# Stop containers, remove volumes, and restart clean
./reset-database.sh

# Or manually:
docker-compose down -v
docker-compose up -d
```

If you need to re-apply the schema manually, import `init.sql` into the PostgreSQL container after it starts.

### Common Database Tasks

```bash
# View current database schema
docker-compose exec postgres psql -U user -d database -c "\dt"

# Backup database
docker-compose exec postgres pg_dump -U user database > backup.sql

# Restore database
docker-compose exec -T postgres psql -U user database < backup.sql
```

## First Admin User

`init.sql` no longer seeds a default admin account. After the database is initialized, create the first admin user:

```bash
# Production (prompts for a secure password ≥ 12 characters)
node scripts/create-admin.js --email admin@example.com --name "Administrator"

# Development only (auto-generates and prints a random password)
node scripts/create-admin.js --email dev@local --name "Dev" --dev
```

**Railway from your machine:** `DATABASE_URL` on Railway uses `postgres.railway.internal`, which only works inside Railway. For local bootstrap, add `DATABASE_PUBLIC_URL` to `.env.local` (from Railway Postgres → Connect) and `DATABASE_SSL_REJECT_UNAUTHORIZED=false`. The script picks the public URL automatically.

**Never** use `admin123` as a password in any environment.

### Run once per environment

Use `create-admin.js` **only** when creating the first admin for a new database. Do **not** re-run it for the same email in production — the script upserts and will **overwrite** that user's password. For password resets, use the admin UI or `POST /users/reset-password` (admin only).

## Development Workflow

### Starting Development

```bash
npm run start:dev
```

The server will watch for file changes and restart automatically.

### Building for Production

```bash
npm run build
npm run start
```

### Accessing API Documentation

Once the server is running, visit:

```
http://localhost:3002/api
```

This is the interactive Swagger/OpenAPI documentation for all available endpoints.

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3002
lsof -ti:3002 | xargs kill -9

# Or use a different port
PORT=3003 npm run start:dev
```

### Database Connection Errors

1. Ensure Docker containers are running: `docker-compose ps`
2. Check PostgreSQL logs: `docker-compose logs postgres`
3. Verify credentials match `.env.local`
4. Reset database: `./reset-database.sh`

### TypeORM Sync Issues

```bash
# Clear build artifacts
rm -rf dist/

# Rebuild
npm run build

# Reinitialize database
./reset-database.sh
```

## Next Steps

- Review [ARCHITECTURE.md](./ARCHITECTURE.md) for project structure and patterns
- Check [AUTHENTICATION.md](./AUTHENTICATION.md) for auth flow details
- See [API_DECORATORS.md](./API_DECORATORS.md) for endpoint documentation patterns
