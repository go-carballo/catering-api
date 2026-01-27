# Catering API - Code Standards & Architecture

## Project Overview

NestJS 11 REST API for managing catering contracts between catering companies and their clients. Multi-tenant system handling contract lifecycle, service day scheduling, and reporting.

## Tech Stack

- **Runtime**: Node.js with TypeScript (strict mode)
- **Framework**: NestJS 11
- **Database**: PostgreSQL 16 with Drizzle ORM
- **Testing**: Vitest (unit + integration)
- **Package Manager**: pnpm

## Architecture

### Modular Structure with Clean Architecture Layers

```
src/
├── modules/
│   └── <feature>/
│       ├── domain/           # Entities, value objects, domain errors, events
│       ├── application/      # Services, DTOs, use cases
│       └── infrastructure/   # Controllers, repositories, external adapters
├── shared/
│   ├── domain/              # Shared domain errors, ports
│   ├── events/              # Event bus, domain events
│   ├── outbox/              # Transactional outbox pattern
│   ├── guards/              # Auth guards
│   ├── decorators/          # Custom decorators
│   └── infrastructure/      # Database, system services
```

### Key Patterns

1. **Rich Domain Entities**: Entities contain behavior, not just data. Use guard methods (`ensureActive()`, `ensureAuthorized()`) that throw domain errors.

2. **Domain Errors**: Extend `DomainError` base class with error codes. Never throw generic errors for business rule violations.

3. **Transactional Outbox**: Events are stored in the outbox table within the same transaction as the aggregate change, ensuring guaranteed delivery.

4. **Data/Entity Separation**: Use `*Data` interfaces for persistence/transfer and `*Entity` classes for domain logic with `toData()` and `fromData()` methods.

## Code Conventions

### TypeScript

- Use `readonly` for entity properties
- Prefer type literals over enums: `type Status = 'ACTIVE' | 'PAUSED' | 'TERMINATED'`
- Use `interface` for data shapes, `type` for unions/aliases
- Always use explicit return types on public methods
- Use `@Inject()` decorator for dependency injection

### Naming

- **Files**: kebab-case (`contract.service.ts`, `create-contract.dto.ts`)
- **Classes**: PascalCase with suffix (`ContractService`, `ContractEntity`, `CreateContractDto`)
- **Interfaces**: PascalCase, no `I` prefix (`ContractData`, not `IContractData`)
- **Domain errors**: `*Error` suffix (`ContractNotActiveError`)
- **Domain events**: `*Event` suffix with past tense (`ContractCreatedEvent`)
- **Tests**: Same name as source file with `.spec.ts` suffix

### Services

- Inject Drizzle client via `@Inject(DRIZZLE)`
- Use transactions for multi-table operations
- Store events in outbox within the same transaction
- Throw NestJS HTTP exceptions (`NotFoundException`, `BadRequestException`) at application layer
- Throw domain errors from entities/domain layer

### DTOs

- Use class-validator decorators for validation
- Keep DTOs in `application/dto/` folder
- Use transformation when needed (`@Transform`)

### Testing

- Use Vitest with `describe`/`it`/`expect`
- Mock Drizzle client with chainable mock object
- Use factory functions for test data (`createCateringCompany()`, `createClientCompany()`)
- Test file location: same directory as source file
- Integration tests in `test/integration/`

## Domain Rules

### Contracts

- Only one ACTIVE contract can exist between the same catering and client companies
- Contracts can be: ACTIVE, PAUSED, TERMINATED
- TERMINATED contracts cannot be paused or resumed
- Status transitions must emit domain events

### Service Days

- Generated based on contract's service days (1-7, Monday-Sunday)
- Expected quantity must respect contract's min/max range
- Notice period must be respected for quantity changes
- Served quantity is confirmed by catering company

### Companies

- Two types: CATERING and CLIENT
- Only ACTIVE companies can create contracts
- Company type determines allowed operations

## Database

### Drizzle ORM Conventions

- Schema defined in `shared/infrastructure/database/schema/`
- Use `eq()`, `and()`, `or()` from drizzle-orm for conditions
- Always use `.returning()` for INSERT/UPDATE when you need the result
- Convert numeric strings to numbers when reading (`Number(contract.pricePerService)`)

## Security

- JWT authentication via Passport
- Guards: `JwtAuthGuard`, `CompanyTypeGuard`
- Use `@Public()` decorator for public endpoints
- Use `@GetCompany()` decorator to extract company from JWT
- Use `@RequireCompanyType()` decorator for authorization

## Git Commit Style

Use conventional commits:

- `feat:` new feature
- `fix:` bug fix
- `refactor:` code change that neither fixes a bug nor adds a feature
- `test:` adding or updating tests
- `docs:` documentation changes
- `chore:` maintenance tasks

Examples:

- `feat(contract): add pause/resume functionality`
- `fix(service-day): correct notice period calculation`
- `test(contract): add integration tests for termination`
