# HMS Backend Documentation

Current documentation for the HMS backend API. It covers setup, architecture, authentication, and Swagger decorator usage for the NestJS + PostgreSQL service.

## Quick Start

### New to the project?

1. Start with [SETUP.md](./SETUP.md) for installation, environment variables, and local startup
2. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for the current stack, request flow, and folder layout

### Need to understand something specific?

- **Authentication & BFF Pattern** → [AUTHENTICATION.md](./AUTHENTICATION.md)
- **API Endpoints & Swagger** → [API_DECORATORS.md](./API_DECORATORS.md)
- **Setup & Environment** → [SETUP.md](./SETUP.md)

## Documentation Index

| File                                     | Purpose                                                             |
| ---------------------------------------- | ------------------------------------------------------------------- |
| [SETUP.md](./SETUP.md)                   | Installation, environment variables, database operations, debugging |
| [ARCHITECTURE.md](./ARCHITECTURE.md)     | Tech stack, project structure, data flow, date handling             |
| [AUTHENTICATION.md](./AUTHENTICATION.md) | JWT flow, BFF pattern, cookie-based auth, token refresh             |
| [API_DECORATORS.md](./API_DECORATORS.md) | Swagger decorators for the API controllers                          |

## Project at a Glance

- **Framework**: NestJS + TypeScript
- **Database**: PostgreSQL 14+
- **Auth**: JWT with refresh tokens + BFF pattern
- **Deployment**: Railway
- **Testing**: Jest with 80%+ coverage
- **Status**: ✅ Functional and deployed

## API Documentation

Once the server is running, interactive API docs are available at:

```
http://localhost:3002/api
```

Swagger is disabled in production, so this endpoint is only available in local development and other non-production environments.

## Next Steps

**Getting started?** → [SETUP.md](./SETUP.md)  
**Understanding the architecture?** → [ARCHITECTURE.md](./ARCHITECTURE.md)  
**Building features?** → [API_DECORATORS.md](./API_DECORATORS.md) + [AUTHENTICATION.md](./AUTHENTICATION.md)  
**Troubleshooting?** → See [SETUP.md](./SETUP.md#troubleshooting)

---

**Last Updated**: June 2026  
**Repository**: [hms-backend](https://github.com/ammtsz/hms_backend)  
**Frontend**: [hms-frontend](../hms-frontend)
