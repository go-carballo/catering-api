# Development Guide
## Setup, Contribution Guidelines, and Workflows

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Project Setup](#project-setup)
3. [Development Workflow](#development-workflow)
4. [Code Quality](#code-quality)
5. [Contribution Process](#contribution-process)
6. [Common Tasks](#common-tasks)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### One Command Setup

```bash
# Clone repository
git clone https://github.com/go-carballo/catering-api.git
cd catering-api

# Full setup (installs deps, starts DB, runs migrations)
make dev-setup

# Start dev server
make dev

# Open http://localhost:3000
# API Swagger docs at http://localhost:3000/docs
```

### Manual Setup

```bash
# 1. Install Node.js 22+
node --version  # Should be v22.0.0 or higher

# 2. Install pnpm
npm install -g pnpm

# 3. Clone and install deps
git clone https://github.com/go-carballo/catering-api.git
cd catering-api
pnpm install

# 4. Copy environment
cp .env.example .env

# 5. Start database
docker compose up -d postgres

# 6. Run migrations
pnpm run migrate

# 7. Seed test data
pnpm run seed

# 8. Start dev server
pnpm start:dev
```

---

## Project Setup

### Environment Variables

```bash
# .env (create from .env.example)

# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5434/catering_db

# JWT
JWT_SECRET=your-256-bit-random-secret

# Email (optional for dev)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-password

# Frontend (for CORS)
FRONTEND_URL=http://localhost:3001

# Node
NODE_ENV=development
PORT=3000
```

### VSCode Extensions

```
Recommended:
  - TypeScript Vue Plugin (Vue)
  - ESLint
  - Prettier - Code formatter
  - Better Comments
  - Error Lens
  - REST Client
  - PostgreSQL
```

### VSCode Settings

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

---

## Development Workflow

### Feature Branch Workflow

```bash
# 1. Update dev branch
git checkout dev
git pull origin dev

# 2. Create feature branch
git checkout -b feat/my-feature

# 3. Make changes
# ... edit files ...

# 4. Commit (runs tests, linting via Git hooks)
git add .
git commit -m "feat: add new feature"
# Gentleman Guardian Angel will:
#   - Run linter
#   - Run tests
#   - Review code with AI

# 5. Push and create PR
git push -u origin feat/my-feature

# 6. GitHub Actions runs:
#   - Lint
#   - Typecheck
#   - Unit tests
#   - Integration tests
#   - Coverage

# 7. Code review (GitHub)
# - Team reviews code
# - Gentleman Guardian Angel provides feedback

# 8. Merge to dev
# - PR approved
# - "Squash and merge" (clean history)
# - Auto-deploy to staging

# 9. Merge to main (later)
# - After testing on staging
# - Manual deploy to production
```

### Commit Message Format

```
feat: add new feature
fix: fix a bug
docs: update documentation
refactor: refactor code
test: add tests
chore: update dependencies

Example:
  feat: add contract pause/resume functionality

  - Implement pause endpoint in ContractController
  - Add domain logic in ContractEntity
  - Add integration tests for state transitions
  - Update service day generation for paused contracts

  Fixes #123
```

### Branch Naming

```
feat/feature-name          - New feature
fix/bug-description        - Bug fix
refactor/what-changed      - Code refactoring
docs/what-changed          - Documentation
test/what-being-tested     - Tests

Example:
  feat/user-management
  fix/service-day-generation
  refactor/contract-queries
```

---

## Code Quality

### Linting

```bash
# Run ESLint
pnpm run lint

# Fix auto-fixable issues
pnpm run lint:fix

# Check specific file
pnpm run lint -- src/modules/contract/domain/entities/contract.entity.ts
```

### Type Checking

```bash
# Check TypeScript types
pnpm run typecheck

# Build (compiles TS to JS)
pnpm run build
```

### Testing

```bash
# Unit tests
pnpm test

# With watch mode (reruns on file change)
pnpm test:watch

# With coverage
pnpm test:cov

# Integration tests (needs Docker)
pnpm test:integration

# E2E tests
pnpm test:e2e

# All tests
pnpm test:all
```

### Code Review Checklist

Before committing, ensure:

- [ ] Code follows naming conventions (PascalCase for classes, camelCase for functions)
- [ ] No `any` types (TypeScript strict mode)
- [ ] No console.log (use logger instead)
- [ ] No hardcoded values (use environment variables)
- [ ] No N+1 queries (batch queries when possible)
- [ ] All tests passing
- [ ] No test skips (xdescribe, xit, skip)
- [ ] Error handling present (try-catch or error boundary)
- [ ] No commented-out code (delete or commit message explaining)

---

## Common Tasks

### Add a New Endpoint

```bash
# 1. Create use case
src/modules/feature/application/usecases/do-something.usecase.ts

# 2. Create controller
src/modules/feature/infrastructure/controllers/feature.controller.ts

# 3. Add route with proper guards
@Post('endpoint')
@RequireCompanyType('CATERING')
async doSomething(@Body() dto: DoSomethingDto) {
  // Implementation
}

# 4. Add tests
src/modules/feature/application/__tests__/do-something.integration.test.ts

# 5. Run tests
pnpm test:all

# 6. Commit
git commit -m "feat: add do-something endpoint"
```

### Add a New Table

```bash
# 1. Define schema
src/db/schema.ts:
  export const myTable = pgTable('my_table', {
    id: uuid('id').primaryKey().defaultRandom(),
    // ... columns
  });

# 2. Generate migration
pnpm run migrate:generate
# Creates: drizzle/XXXX_add_my_table.sql

# 3. Run migration locally
pnpm run migrate

# 4. Create repository
src/modules/feature/infrastructure/persistence/my.repository.ts

# 5. Add to module providers
src/modules/feature/feature.module.ts

# 6. Write tests
src/modules/feature/infrastructure/__tests__/my.repository.test.ts

# 7. Commit
git commit -m "feat: add my_table schema and repository"
```

### Debug a Test

```bash
# Run single test file
pnpm test -- src/modules/contract/domain/__tests__/contract.entity.test.ts

# Run tests matching pattern
pnpm test -- --grep "pause"

# Run with debugging (print statements visible)
pnpm test -- --reporter=verbose

# Debug in VSCode
# 1. Set breakpoint in test
# 2. Run: node --inspect-brk ./node_modules/vitest/vitest.mjs run
# 3. Open Chrome DevTools
```

### Start Fresh Database

```bash
# Reset database (deletes all data!)
make db-reset

# Or manually
docker compose down postgres
docker compose up -d postgres
pnpm run migrate
pnpm run seed
```

### Connect to Database

```bash
# Interactive psql shell
make db-shell

# Or directly
psql postgres://postgres:postgres@localhost:5434/catering_db

# Commands:
\dt              -- List tables
\d contracts     -- Describe table
SELECT * FROM contracts;
\q               -- Quit
```

### Generate Test Data

```bash
# Seed database
pnpm run seed

# Or programmatically
import { seedDatabase } from '@/seed';
await seedDatabase();

# Creates:
# - 3 catering companies
# - 3 client companies
# - 5 contracts
# - 150+ service days
# - Test users for each company
```

---

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 pnpm start:dev
```

### Database Connection Failed

```bash
# Check Docker is running
docker ps

# Check PostgreSQL is up
docker compose logs postgres

# Verify DATABASE_URL in .env
# Should be: postgres://postgres:postgres@localhost:5434/catering_db

# Try restart
docker compose down
docker compose up -d postgres

# Wait for startup (30 seconds)
sleep 30

# Run migrations
pnpm run migrate
```

### Tests Failing

```bash
# Clear cache
rm -rf dist node_modules/.vite

# Reinstall
pnpm install

# Run tests again
pnpm test

# If still failing:
pnpm test:all  -- --reporter=verbose
# Shows detailed output
```

### Git Hook Errors

```bash
# Pre-commit hook ran tests and failed
# Fix the issues:
pnpm run lint:fix
pnpm test

# Retry commit
git commit -m "message"

# Or skip hooks (not recommended!)
git commit --no-verify
```

### Type Errors

```bash
# TypeScript strict mode catches many issues
# Run type check:
pnpm run typecheck

# Common fixes:
# - Add explicit types: const x: string = "hello"
# - Handle null: if (x !== null) { ... }
# - Use type assertions (carefully): x as string
```

---

## Performance Tips

### During Development

```bash
# Watch mode rebuilds only changed files
pnpm test:watch

# Run specific test file (faster than all)
pnpm test -- contract.entity.test.ts

# Run tests in parallel (default)
pnpm test -- --threads

# Run single-threaded if flaky
pnpm test -- --no-threads
```

### Database Queries

```typescript
// DON'T: N+1 query problem
const contracts = await findAll();
for (const contract of contracts) {
  const details = await findDetails(contract.id);  // 10 queries!
}

// DO: Batch query
const contracts = await findAll();
const details = await findDetailsBatch(contracts.map(c => c.id));  // 1 query

// Or: Join
const withDetails = await db
  .select()
  .from(contracts)
  .leftJoin(details, eq(contracts.id, details.contractId));
```

### Logging in Production

```typescript
// DON'T: Log everything
logger.debug(`User: ${user}, Action: ${action}, Data: ${data}`);

// DO: Log only important events
logger.info('CONTRACT_CREATED', { contractId, userId });

// Even better: Use structured logging
logger.info({
  message: 'contract.created',
  contractId,
  cateringId,
  clientId,
  timestamp: new Date(),
});
```

---

## Useful Commands

```bash
# Development
make dev              # Start dev server
make test             # Run tests
make lint             # Run linter
make format           # Format code
make typecheck        # TypeScript check

# Database
make db-up            # Start PostgreSQL
make db-down          # Stop PostgreSQL
make db-shell         # Connect to DB
make migrate          # Run migrations
make seed             # Seed test data

# Docker
make build-docker     # Build Docker image
make up               # Start in production mode
make down             # Stop containers

# Tools
make help             # Show all commands
make pgadmin          # Start pgAdmin UI
make migrate:studio   # Open Drizzle Studio (DB GUI)
```

---

## Resources

### Documentation

- [Project Overview](./PROJECT_OVERVIEW.md) - Feature catalog
- [Architecture](./ARCHITECTURE.md) - Design patterns
- [API Documentation](./API_DOCUMENTATION.md) - Endpoint reference
- [Database Design](./DATABASE_DESIGN.md) - Schema and optimization

### External

- [NestJS Docs](https://docs.nestjs.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- [Drizzle ORM](https://orm.drizzle.team)
- [PostgreSQL Docs](https://www.postgresql.org/docs)
- [Clean Architecture](https://blog.cleancoder.com)

---

<p align="center">
  <sub>Development Guide for ChefOps - Setup, Workflows, and Contribution Process</sub>
</p>
