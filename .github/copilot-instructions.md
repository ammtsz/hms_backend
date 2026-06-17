```instructions
<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# HMS Backend Copilot Instructions

Keep suggestions aligned with the docs in ./docs and the rule files under ./.cursor/rules.

## Working rules

- Prefer the existing NestJS structure: controllers for transport, services for business logic, DTOs for validation, entities for persistence, and transformers when response shaping is needed.
- Use TypeScript strict mode, class-validator DTOs, and small explicit request/response types.
- Keep auth, validation, guards, filters, decorators, and strategies in src/common.
- Use the root SQL schema and the existing scripts for local database setup and resets.
- Keep tests with the code they cover and update unit or e2e coverage when behavior changes.
- Preserve the current auth, rate-limiting, date handling, and error-code conventions.

## Before changing behavior

- Check the docs in ./docs for workflow, auth, architecture, and setup details.
- Update documentation only when the change affects public behavior, setup, or architecture.
- Reuse existing modules and services instead of duplicating domain logic.
```
