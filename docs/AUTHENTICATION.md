# Backend Authentication Documentation

**Last Updated:** June 15, 2026
**Status:** ✅ **PRODUCTION READY**
**Backend:** NestJS + TypeORM + PostgreSQL + JWT

This is the practical reference for backend auth. It keeps the operational details that are hard to infer from code and points to the source files when the implementation itself matters.

## What this doc covers

- Startup requirements and environment variables
- Login, refresh, logout, and me endpoints
- Production rules for BFF-only auth
- Troubleshooting and deployment checks

## What lives elsewhere

- Project overview and general setup: [hms-backend/README.md](../README.md)
- Setup and environment details: [SETUP.md](./SETUP.md)
- System structure and data flow: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Frontend-side auth/BFF behavior: [hms-frontend/docs/AUTHENTICATION.md](../../hms-frontend/docs/AUTHENTICATION.md)

---

## Current security posture

The authentication layer is production ready and intentionally strict:

| Control                   | Current behavior                                                           |
| ------------------------- | -------------------------------------------------------------------------- |
| Global auth enforcement   | `JwtAuthGuard` is the default via `APP_GUARD`                              |
| Public routes             | Only explicit routes opt out with `@Public()`                              |
| Token rotation            | Refresh token is revoked before a new pair is issued                       |
| Startup validation        | App fails fast if `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing          |
| CORS                      | Uses a single allowed origin; no wildcard fallback                         |
| Rate limiting             | Login is limited to 5/min; global throttling is enabled                    |
| Account lockout           | 5 failures cause a 15-minute lockout                                       |
| Password storage          | `bcrypt` with 10 rounds                                                    |
| Admin bootstrap           | No default admin is seeded                                                 |
| Production browser access | Browser traffic goes through the frontend BFF, not directly to the backend |

If you need the exact implementation, check `src/app.module.ts`, `src/main.ts`, `src/controllers/auth.controller.ts`, `src/services/auth.service.ts`, and `src/common/strategies/jwt.strategy.ts`.

---

## Quick setup

### 1) Install dependencies

```bash
cd hms-backend
npm install
```

### 2) Configure environment variables

Create `.env.local` for development or `.env` for production.

```bash
JWT_SECRET=your-32-byte-or-longer-secret
JWT_REFRESH_SECRET=your-different-32-byte-or-longer-secret
CORS_ORIGIN=http://localhost:3000

# Required in production
BFF_INTERNAL_SECRET=<shared-with-frontend>

DATABASE_URL=postgresql://user:password@host:port/dbname
PORT=3002
NODE_ENV=development
THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3) Prepare the database

```bash
./reset-database.sh
```

Or apply the schema manually:

```bash
psql $DATABASE_URL -f init.sql
```

### 4) Create the first admin

`init.sql` does not seed a default user.

```bash
node scripts/create-admin.js --email admin@example.com --name "Administrator"
```

For local development only:

```bash
node scripts/create-admin.js --email dev@local --name "Dev" --dev
```

### 5) Start the backend

```bash
npm run start:dev
```

### 6) Test login

```bash
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<your-password>"}'
```

Expected: `200 OK` with access and refresh tokens in JSON.

---

## How auth works

### Default protection model

- Every endpoint is protected by default.
- Public routes opt out with `@Public()`.
- The frontend BFF is responsible for setting and clearing httpOnly cookies.
- The backend remains the authority for authentication and token validity.

### Token model

- Access token: 8 hours
- Refresh token: 7 days
- Storage: httpOnly cookies
- Refresh token state: tracked in the database so it can be revoked immediately

### Frontend integration

In production, the browser should not call the Railway backend directly.

| Concern          | Behavior                                             |
| ---------------- | ---------------------------------------------------- |
| Login and logout | Done by frontend server actions using `x-bff-secret` |
| API calls        | Go through same-origin `/api/*` proxy routes         |
| Refresh          | Triggered by the frontend BFF after a `401`          |
| User profile     | Read via `/api/auth/me`                              |
| Browser cookies  | Set by the frontend BFF, not by the Nest backend     |

See the frontend auth doc for the full browser-side flow: [hms-frontend/docs/AUTHENTICATION.md](../../hms-frontend/docs/AUTHENTICATION.md).

---

## API reference

### POST /auth/login

Authenticates a user and returns tokens plus basic user data.

**Production rule:** requires the `x-bff-secret` header to match `BFF_INTERNAL_SECRET`.

**Typical response:**

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "name": "Administrator",
    "role": "admin",
    "isActive": true
  }
}
```

### POST /auth/refresh

Rotates both tokens.

- Requires the refresh token cookie
- Requires `x-bff-secret` in production
- Revokes the previous refresh token before issuing a new pair

### POST /auth/logout

Revokes the refresh token in the database. The frontend clears browser cookies after the call.

### GET /auth/me

Returns the current authenticated user.

Requires a valid access token.

### Protected controllers

All protected controllers follow the same rule: they work only when the request has a valid JWT.

Examples:

- Patients
- Appointments
- Consultations
- Treatments
- Sessions

---

## Troubleshooting

### JWT secret missing

If the app fails at startup, verify:

```bash
echo $JWT_SECRET
echo $JWT_REFRESH_SECRET
```

### CORS errors

Make sure the backend origin matches the frontend exactly.

```bash
CORS_ORIGIN=http://localhost:3000
```

### Cookie parsing problems

Confirm `cookie-parser` is enabled in `main.ts`.

### Database connection problems

Check `DATABASE_URL` and test the connection before starting the app.

---

## Production deployment checklist

- Set `JWT_SECRET` and `JWT_REFRESH_SECRET`
- Set `CORS_ORIGIN` to the exact frontend URL
- Set `BFF_INTERNAL_SECRET` to the same value used by the frontend
- Run the database schema or migration step
- Create the first admin manually
- Verify login, refresh, logout, and `/auth/me`
- Confirm Swagger is disabled in production

### Recommended verification steps

```bash
curl -I https://your-backend.railway.app/auth/me
```

Expected: security headers and no public Swagger in production.

---

## Notes for maintainers

- Keep implementation details in code, not duplicated here.
- Update this doc when auth behavior changes, especially environment variables, token rules, or BFF requirements.
- If you need deeper architecture context, use [ARCHITECTURE.md](./ARCHITECTURE.md).

**Implementation status:** ✅ Production ready
