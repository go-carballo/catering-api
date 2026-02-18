# Testing Strategy & Coverage
## Test Pyramid, Metrics, and Quality Assurance

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Pyramid](#test-pyramid)
3. [Unit Tests](#unit-tests)
4. [Integration Tests](#integration-tests)
5. [E2E Tests](#e2e-tests)
6. [Coverage Analysis](#coverage-analysis)
7. [Test Execution](#test-execution)
8. [Continuous Integration](#continuous-integration)

---

## Testing Philosophy

### Core Principles

1. **Confidence Over Coverage**: 80% coverage with meaningful tests beats 100% meaningless coverage
2. **Fast Feedback**: Unit tests run in <100ms, catch problems immediately
3. **Cost/Benefit**: More unit tests (cheap), fewer E2E tests (expensive)
4. **Domain-Driven**: Test business logic, not framework behavior
5. **Testability**: Code designed to be testable (single responsibility, dependency injection)

### Test Mindset

```
Question: "Should this be a test?"

YES if:
- It tests domain logic (business rules)
- It's a common happy path
- It's an edge case that could break
- It catches regression bugs

NO if:
- It tests framework behavior (NestJS handles it)
- It's testing mocks (circular logic)
- It's testing trivial getters/setters
- It has flaky external dependencies
```

---

## Test Pyramid

### Structure

```
        △
       /│\
      / │ \      E2E Tests (2-3)
     /  │  \     - Real HTTP
    /───┼───\    - Full stack
   /    │    \   - Slow: 1-10 sec
  / Inte│grat\ 
 /gration   \   Integration (7 files)
/ Tests      \ - DB + Domain
/──────┼──────\ - Medium: 100-500ms
│      │      │
│  Unit│Tests │ Unit (14+ files)
│  (266)      │ - Isolated logic
│ Fast: <1ms  │ - Mocked deps
└──────┴──────┘
```

### Distribution (Ideal)

| Level | Count | % Time | Purpose |
|-------|-------|--------|---------|
| **Unit** | 70% | 10% | Catch bugs fast |
| **Integration** | 25% | 80% | Verify interactions |
| **E2E** | 5% | 10% | Verify end-to-end flow |

### Our Distribution (Actual)

| Level | Count | Files | Time | Status |
|-------|-------|-------|------|--------|
| **Unit** | ~200 | 14+ | <5s | ✅ Good |
| **Integration** | ~50 | 7 | ~30s | ✅ Good |
| **E2E** | ~16 | 2 | ~10s | ⚠️ Could expand |
| **Frontend** | ~8 | 8 | <2s | ⚠️ Light |
| **Total** | **266+** | **31** | **~50s** | ✅ Solid |

---

## Unit Tests

### Purpose

- **Isolated**: Test one function/class in isolation
- **Fast**: No I/O, no database, no HTTP
- **Deterministic**: Same input always produces same output
- **Focused**: Each test has one assertion

### Example: ContractEntity Unit Test

```typescript
// src/modules/contract/domain/__tests__/contract.entity.test.ts

describe('ContractEntity', () => {
  let entity: ContractEntity;

  beforeEach(() => {
    entity = new ContractEntity({
      id: 'contract-123',
      cateringId: 'cat-123',
      clientId: 'cli-456',
      status: 'ACTIVE',
      minDailyQuantity: 10,
      defaultQuantity: 50,
      maxQuantity: 100,
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-12-31'),
    });
  });

  describe('pause()', () => {
    it('should transition from ACTIVE to PAUSED', () => {
      // Arrange
      expect(entity.status).toBe('ACTIVE');

      // Act
      entity.pause();

      // Assert
      expect(entity.status).toBe('PAUSED');
    });

    it('should throw if already PAUSED', () => {
      // Arrange
      entity.pause();

      // Act & Assert
      expect(() => entity.pause()).toThrow(InvalidTransitionError);
    });

    it('should not allow pausing TERMINATED contract', () => {
      // Arrange
      entity.status = 'TERMINATED';

      // Act & Assert
      expect(() => entity.pause()).toThrow(InvalidTransitionError);
    });
  });

  describe('getFinancialMetrics()', () => {
    it('should calculate cost per person correctly', () => {
      // Arrange
      const serviceDays = [
        { served: 50 },
        { served: 48 },
        { served: 52 },
      ];
      const totalCost = 1500; // 50 * 30

      // Act
      const metrics = entity.getFinancialMetrics(serviceDays, totalCost);

      // Assert
      expect(metrics.costPerPerson).toBe(1500 / 150); // 10 per person
    });
  });
});
```

### Test Organization

```
domain/
├── entities/
│   ├── contract.entity.ts
│   └── __tests__/
│       └── contract.entity.test.ts
│
├── services/
│   ├── contract-rules.service.ts
│   └── __tests__/
│       └── contract-rules.service.test.ts
```

**Rule**: Place `__tests__` next to code (co-location)

### Unit Test Tools

```typescript
// Vitest: Fast unit test runner
// Testing Library: DOM testing utilities
// Happy DOM: Lightweight DOM implementation

import { describe, it, expect, beforeEach } from 'vitest';

describe('FeatureName', () => {
  it('should do something', () => {
    // Test goes here
  });
});
```

---

## Integration Tests

### Purpose

- **Test Interactions**: Verify layers work together
- **Real Database**: Use actual DB (or test container)
- **Event Handling**: Test outbox/event bus
- **Repositories**: Test queries execute correctly

### Example: CreateContractUseCase Integration Test

```typescript
// src/modules/contract/application/__tests__/create-contract.integration.test.ts

describe('CreateContractUseCase (Integration)', () => {
  let app: INestApplication;
  let db: Database;
  let useCase: CreateContractUseCase;
  let contractRepository: ContractRepository;
  let eventBus: InMemoryEventBus;

  beforeAll(async () => {
    // Set up test database (isolated transaction)
    db = await setupTestDatabase();
    
    const moduleRef = await Test.createTestingModule({
      imports: [ContractModule],
      providers: [
        { provide: Database, useValue: db },
        { provide: InMemoryEventBus, useClass: InMemoryEventBus },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    useCase = moduleRef.get(CreateContractUseCase);
    contractRepository = moduleRef.get(ContractRepository);
    eventBus = moduleRef.get(InMemoryEventBus);
  });

  afterAll(async () => {
    // Rollback transaction
    await db.rollback();
    await app.close();
  });

  describe('execute()', () => {
    it('should create contract and persist to database', async () => {
      // Arrange
      const data: CreateContractDto = {
        cateringId: 'cat-123',
        clientId: 'cli-456',
        serviceDays: [1, 2, 3, 4, 5],
        minDailyQuantity: 10,
        defaultQuantity: 50,
        maxQuantity: 100,
        startDate: '2026-03-01',
        endDate: '2026-12-31',
      };

      // Act
      const result = await useCase.execute(data);

      // Assert
      expect(result.ok).toBe(true);
      
      // Verify persisted to database
      const saved = await contractRepository.findById(result.contract.id);
      expect(saved).toBeDefined();
      expect(saved.cateringId).toBe('cat-123');
    });

    it('should prevent duplicate active contracts', async () => {
      // Arrange
      const data: CreateContractDto = {
        cateringId: 'cat-123',
        clientId: 'cli-456',
        // ... rest of data
      };

      // Act: Create first contract
      const first = await useCase.execute(data);
      expect(first.ok).toBe(true);

      // Act: Try to create duplicate
      const second = await useCase.execute(data);

      // Assert
      expect(second.ok).toBe(false);
      expect(second.code).toBe('DUPLICATE_CONTRACT');
    });

    it('should publish domain event to outbox', async () => {
      // Arrange
      const data: CreateContractDto = { /* ... */ };

      // Act
      const result = await useCase.execute(data);

      // Assert
      const outboxEvents = await db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.aggregateId, result.contract.id));

      expect(outboxEvents).toHaveLength(1);
      expect(outboxEvents[0].eventType).toBe('contract.created');
    });
  });
});
```

### Integration Test Tools

```typescript
// NestJS Test utilities
import { Test, TestingModule } from '@nestjs/testing';

// Docker Testcontainers (isolated PostgreSQL for tests)
import { GenericContainer } from 'testcontainers';

// Setup function
async function setupTestDatabase() {
  const container = await new GenericContainer('postgres:16')
    .withEnvironment({
      POSTGRES_PASSWORD: 'password',
      POSTGRES_DB: 'test_db',
    })
    .start();

  return new Database(container.getConnectionString());
}
```

---

## E2E Tests

### Purpose

- **Full Stack**: HTTP request → Business logic → Database → HTTP response
- **Real Scenarios**: Mimic actual user workflows
- **Confidence**: Ensures complete feature works end-to-end

### Example: Contract Creation E2E Test

```typescript
// test/e2e/contract.e2e.test.ts

describe('Contract Endpoints (E2E)', () => {
  let app: INestApplication;
  let cateringToken: string;
  let clientToken: string;
  let cateringId: string;
  let clientId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Setup: Create companies and login
    const cateringRes = await request(app.getHttpServer())
      .post('/api/caterings')
      .send({
        name: 'Test Catering',
        email: 'catering@test.com',
        password: 'SecurePass123',
        dailyCapacity: 500,
      });

    cateringId = cateringRes.body.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'catering@test.com',
        password: 'SecurePass123',
      });

    cateringToken = loginRes.body.token;

    // Similar setup for client company...
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /contracts', () => {
    it('should create contract and return 201', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/contracts')
        .set('Authorization', `Bearer ${cateringToken}`)
        .send({
          clientId: clientId,
          serviceDays: [1, 2, 3, 4, 5],
          minDailyQuantity: 10,
          defaultQuantity: 50,
          maxQuantity: 100,
          startDate: '2026-03-01',
          endDate: '2026-12-31',
        });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.cateringId).toBe(cateringId);
    });

    it('should return 400 if duplicate contract', async () => {
      // Arrange: Create first contract
      const createRes = await request(app.getHttpServer())
        .post('/api/contracts')
        .set('Authorization', `Bearer ${cateringToken}`)
        .send({
          clientId: clientId,
          serviceDays: [1, 2, 3, 4, 5],
          minDailyQuantity: 10,
          defaultQuantity: 50,
          maxQuantity: 100,
          startDate: '2026-03-01',
          endDate: '2026-12-31',
        });

      expect(createRes.status).toBe(201);

      // Act: Try to create duplicate
      const dupRes = await request(app.getHttpServer())
        .post('/api/contracts')
        .set('Authorization', `Bearer ${cateringToken}`)
        .send({
          clientId: clientId,  // Same client
          serviceDays: [1, 2, 3, 4, 5],
          minDailyQuantity: 10,
          defaultQuantity: 50,
          maxQuantity: 100,
          startDate: '2026-04-01',  // Different dates
          endDate: '2026-12-31',
        });

      // Assert
      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error).toBe('DUPLICATE_CONTRACT');
    });

    it('should require CATERING company type', async () => {
      // Act: Client tries to create contract
      const response = await request(app.getHttpServer())
        .post('/api/contracts')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          clientId: clientId,
          serviceDays: [1, 2, 3, 4, 5],
          minDailyQuantity: 10,
          defaultQuantity: 50,
          maxQuantity: 100,
          startDate: '2026-03-01',
          endDate: '2026-12-31',
        });

      // Assert
      expect(response.status).toBe(403);
    });
  });

  describe('Service Day Confirmation Workflow', () => {
    let contractId: string;
    let serviceDayId: string;

    beforeEach(async () => {
      // Create contract
      const contractRes = await request(app.getHttpServer())
        .post('/api/contracts')
        .set('Authorization', `Bearer ${cateringToken}`)
        .send(validContractData);

      contractId = contractRes.body.id;

      // Generate service days
      await request(app.getHttpServer())
        .post(`/api/contracts/${contractId}/service-days/generate`)
        .set('Authorization', `Bearer ${cateringToken}`)
        .send({ days: 7 });

      // Get first service day
      const listRes = await request(app.getHttpServer())
        .get(`/api/contracts/${contractId}/service-days?from=2026-03-01&to=2026-03-07`)
        .set('Authorization', `Bearer ${cateringToken}`);

      serviceDayId = listRes.body.data[0].id;
    });

    it('should complete confirmation workflow', async () => {
      // Step 1: Client confirms expected quantity
      const confirmRes = await request(app.getHttpServer())
        .post(`/api/service-days/${serviceDayId}/confirm-expected`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ expectedQuantity: 45 });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.expectedQuantity).toBe(45);

      // Step 2: Catering confirms served quantity
      const serveRes = await request(app.getHttpServer())
        .post(`/api/service-days/${serviceDayId}/confirm-served`)
        .set('Authorization', `Bearer ${cateringToken}`)
        .send({ servedQuantity: 43 });

      expect(serveRes.status).toBe(200);
      expect(serveRes.body.servedQuantity).toBe(43);

      // Step 3: Verify both confirmed
      const detailRes = await request(app.getHttpServer())
        .get(`/api/contracts/${contractId}/service-days?from=2026-03-01&to=2026-03-07`)
        .set('Authorization', `Bearer ${cateringToken}`);

      const day = detailRes.body.data[0];
      expect(day.expectedQuantityConfirmedAt).toBeDefined();
      expect(day.servedQuantityConfirmedAt).toBeDefined();
    });
  });
});
```

---

## Coverage Analysis

### Coverage Metrics

```bash
# Run coverage
pnpm run test:cov

# Output example
────────────────────────────────────────────────────────
File           | % Stmts | % Branches | % Funcs | % Lines
────────────────────────────────────────────────────────
All files      |   78.5  |    72.3    |  81.2   |  77.8
────────────────────────────────────────────────────────
contract/      |   92.1  |    88.5    |  94.3   |  91.7
service-day/   |   89.3  |    85.2    |  91.5   |  88.9
auth/          |   45.2  |    38.1    |  42.3   |  44.8
────────────────────────────────────────────────────────
```

### Coverage by Module

| Module | Unit | Integration | E2E | Total |
|--------|------|-------------|-----|-------|
| **contract** | 92% | ✅ | ✅ | **92%** |
| **service-day** | 89% | ✅ | ✅ | **89%** |
| **catering** | 85% | ⚠️ | — | **85%** |
| **client** | 83% | ⚠️ | — | **83%** |
| **health** | 100% | ✅ | ✅ | **100%** |
| **outbox** | 91% | ✅ | — | **91%** |
| **guards** | 88% | ✅ | — | **88%** |
| **auth** | 45% | ⚠️ | ⚠️ | **45%** |
| **seed** | 0% | — | — | **0%** |

### Coverage Goals

- **Overall**: > 80% (we're at 78.5%)
- **Domain logic**: > 90% (we're at 92%)
- **Controllers**: > 60% (basic happy paths)
- **Critical paths**: 100% (auth, contracts, confirmations)

---

## Test Execution

### Run All Tests

```bash
# Unit tests only (fast)
pnpm test
# Output: ~5 seconds, 200+ passing

# Integration tests (slower, needs DB)
pnpm test:integration
# Output: ~30 seconds, 50+ passing

# E2E tests (slowest, full stack)
pnpm test:e2e
# Output: ~10 seconds, 16+ passing

# All tests with coverage
pnpm test:all
# Output: ~50 seconds, 266+ passing, 78.5% coverage

# Watch mode (reruns on file change)
pnpm test:watch
```

### Test Configuration (Vitest)

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/**/*.test.ts',
      ],
    },
  },
});

// vitest.integration.config.ts (separate for slow tests)
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30000,  // Longer for DB operations
  },
});
```

---

## Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      
      - uses: actions/setup-node@v3
        with:
          node-version: 22
          cache: 'pnpm'
      
      - run: pnpm install
      
      - run: pnpm run lint
      
      - run: pnpm run typecheck
      
      - run: pnpm test
      
      - run: pnpm test:integration
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

### Pre-Commit Hooks

```bash
# .husky/pre-commit
# Run before commit

pnpm run lint
pnpm run typecheck
pnpm test --run

# If any fails, commit is blocked
# Forces all committed code to pass tests
```

---

## Testing Checklist

### Before Marking Test Complete

- [ ] Test has clear, descriptive name
- [ ] Test has one assertion (or tightly related)
- [ ] Arrange → Act → Assert pattern clear
- [ ] Mock dependencies (not real services)
- [ ] Test both happy path AND error case
- [ ] No test depends on another test
- [ ] Test cleans up (database transactions, mocks)
- [ ] Test is deterministic (no flakiness)
- [ ] Test failure message is clear

### Before Merging PR

- [ ] All tests passing
- [ ] Coverage didn't decrease
- [ ] No test warnings
- [ ] New features have tests
- [ ] Regressions covered by tests

---

<p align="center">
  <sub>Testing Strategy for ChefOps - Test Pyramid, Coverage, and CI/CD Integration</sub>
</p>
