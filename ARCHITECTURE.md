# ChefOps Architecture Guide
## Clean Architecture + Domain-Driven Design Implementation

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Layered Architecture](#layered-architecture)
3. [Module Structure](#module-structure)
4. [Data Flow](#data-flow)
5. [Event-Driven Patterns](#event-driven-patterns)
6. [Authorization Model](#authorization-model)
7. [Database Architecture](#database-architecture)
8. [Design Patterns Used](#design-patterns-used)
9. [Dependency Injection](#dependency-injection)
10. [Testing Architecture](#testing-architecture)

---

## Architecture Overview

### The Philosophy

ChefOps follows **Clean Architecture** principles as defined by Robert C. Martin, combined with **Domain-Driven Design** (DDD) practices. The key idea:

> **"The architecture should tell you about the system, not about the frameworks you chose."**

This means:
- Business logic is independent of HTTP, databases, UI frameworks
- Dependencies flow inward—infrastructure depends on application, application depends on domain
- The system is highly testable without mocking frameworks
- Replacing NestJS with Express (or PostgreSQL with MySQL) requires minimal changes

### Visual Model

```
┌─────────────────────────────────────────────────────────────┐
│                   Presentation Layer                        │
│              (HTTP Controllers, DTOs)                       │
│                    (Express/NestJS)                         │
└─────────────────────┬───────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│              APPLICATION LAYER                              │
│   (Use Cases, Services, Handlers, Mappers)                 │
│        (Framework-agnostic business rules)                  │
└─────────────────────┬───────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│                 DOMAIN LAYER                                │
│  (Entities, Value Objects, Domain Rules, Errors)           │
│          (Pure TypeScript - NO external deps)              │
└─────────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│           INFRASTRUCTURE LAYER                              │
│  (Database, Email, External APIs, Adapters)                │
│      (Implements abstract ports from application)          │
└─────────────────────────────────────────────────────────────┘
```

---

## Layered Architecture

### 1. Domain Layer (Core Business Logic)

**Location**: `src/modules/<feature>/domain/`

**Responsibility**: Encapsulate business rules, protect invariants, define domain models

**What Lives Here**:
- **Entities**: Rich objects with behavior (ContractEntity, ServiceDayEntity)
- **Value Objects**: Immutable, compared by value (Money, DateRange)
- **Domain Errors**: Business-specific exceptions
- **Domain Rules**: Pure functions that validate domain invariants
- **Aggregates**: Entity roots that protect consistency boundaries

**Key Principle**: **No dependencies on external libraries** (except TypeScript types). No NestJS, no Drizzle, no HTTP.

**Example: ContractEntity**

```typescript
// domain/entities/contract.entity.ts

export class ContractEntity {
  private status: ContractStatus;
  private serviceDays: ServiceDayEntity[];
  
  constructor(private data: ContractData) {
    this.status = 'ACTIVE';
    this.serviceDays = [];
  }

  // Domain rule: only ACTIVE contracts can be paused
  pause(): void {
    if (this.status !== 'ACTIVE') {
      throw new InvalidContractStateError(
        `Cannot pause contract with status ${this.status}`
      );
    }
    this.status = 'PAUSED';
  }

  // Domain calculation: pure function
  getFinancialMetrics(): Metrics {
    const totalCost = this.serviceDays
      .reduce((sum, day) => sum + day.getCost(), 0);
    
    return {
      totalSpent: totalCost,
      costPerPerson: totalCost / this.getTotalServings(),
      utilization: (totalCost / this.data.budget) * 100,
    };
  }

  // Convert to persistence format
  toData(): ContractData {
    return { ...this.data, status: this.status };
  }

  // Convert from persistence format
  static fromData(data: ContractData): ContractEntity {
    const entity = new ContractEntity(data);
    entity.status = data.status;
    return entity;
  }
}
```

**Testing Domain Layer**:
```typescript
it('should not allow pausing a PAUSED contract', () => {
  const contract = new ContractEntity({ status: 'PAUSED' });
  expect(() => contract.pause()).toThrow(InvalidContractStateError);
});

// NO mocking, NO databases, NO HTTP - just pure logic
```

### 2. Application Layer (Use Cases & Services)

**Location**: `src/modules/<feature>/application/`

**Responsibility**: Orchestrate domain objects, handle transactions, coordinate with infrastructure

**What Lives Here**:
- **Use Cases**: Step-by-step workflows (CreateContractUseCase)
- **Services**: Domain services that don't fit in a single entity
- **Event Handlers**: React to domain events
- **DTOs**: Data Transfer Objects for input/output
- **Mappers**: Convert between domain entities and DTOs

**Key Principle**: **Thin application layer**. Most logic should be in domain; application just coordinates.

**Example: CreateContractUseCase**

```typescript
// application/usecases/create-contract.usecase.ts

export type CreateContractResult = 
  | { ok: true; contract: ContractEntity }
  | { ok: false; error: DomainError; code: ErrorCode };

export class CreateContractUseCase {
  constructor(
    private contractRepository: ContractRepository,
    private eventPublisher: EventPublisher,
  ) {}

  async execute(data: CreateContractDto): Promise<CreateContractResult> {
    // 1. Validation (could be moved to domain)
    if (data.startDate >= data.endDate) {
      return {
        ok: false,
        error: new InvalidDatesError(),
        code: 'INVALID_DATES',
      };
    }

    // 2. Business rule: check for duplicate active contract
    const existingContract = await this.contractRepository
      .findActiveByCompanies(data.cateringId, data.clientId);
    
    if (existingContract) {
      return {
        ok: false,
        error: new DuplicateContractError(),
        code: 'DUPLICATE_CONTRACT',
      };
    }

    // 3. Create domain object (domain logic runs here)
    const contract = ContractEntity.create({
      ...data,
      status: 'ACTIVE',
    });

    // 4. Persist
    const saved = await this.contractRepository.save(contract);

    // 5. Publish event (handled by outbox in infrastructure)
    await this.eventPublisher.publish(
      new ContractCreatedEvent(saved.id, saved.cateringId)
    );

    return { ok: true, contract: saved };
  }
}
```

**Testing Application Layer**:
```typescript
// With mocked repository, we test orchestration logic
const mockRepository = mock<ContractRepository>();
mockRepository.findActiveByCompanies.mockResolvedValue(null);

const useCase = new CreateContractUseCase(mockRepository, eventPublisher);
const result = await useCase.execute(validData);

expect(result.ok).toBe(true);
expect(mockRepository.save).toHaveBeenCalled();
```

### 3. Infrastructure Layer (Frameworks & Databases)

**Location**: `src/modules/<feature>/infrastructure/`

**Responsibility**: Implement technical concerns—HTTP, persistence, external services

**What Lives Here**:
- **Controllers**: HTTP endpoints, request parsing
- **Repositories**: Database access (Drizzle ORM)
- **External Adapters**: Email, cloud storage, third-party APIs
- **Event Handlers**: Event bus subscribers (not just domain logic)
- **Guards**: NestJS authentication/authorization

**Key Principle**: **Infrastructure is disposable**. Swapping NestJS for Express or PostgreSQL for MongoDB should only require changes here.

**Example: ContractController**

```typescript
// infrastructure/controllers/contract.controller.ts

@Controller('contracts')
@UseGuards(JwtAuthGuard, CompanyTypeGuard)
export class ContractController {
  constructor(
    private createContractUseCase: CreateContractUseCase,
    private contractRepository: ContractRepository,
  ) {}

  @Post()
  @RequireCompanyType('CATERING')
  async create(
    @Body() dto: CreateContractDto,
    @GetCompany() company: CompanyEntity,
  ): Promise<CreateContractResponse> {
    const result = await this.createContractUseCase.execute({
      ...dto,
      cateringId: company.id,
    });

    if (!result.ok) {
      throw new HttpException(
        { error: result.code },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Map entity to DTO for HTTP response
    return ContractMapper.toDTO(result.contract);
  }

  @Get(':id')
  async getById(
    @Param('id') id: string,
    @GetCompany() company: CompanyEntity,
  ): Promise<ContractDetailResponse> {
    const contract = await this.contractRepository.findById(id);
    
    // Authorization: ensure company is part of this contract
    if (!contract.involves(company.id)) {
      throw new ForbiddenException();
    }

    return ContractMapper.toDTO(contract);
  }
}
```

**Example: ContractRepository (Infrastructure)**

```typescript
// infrastructure/persistence/contract.repository.ts

@Injectable()
export class ContractRepository {
  constructor(private db: Database) {}

  async save(entity: ContractEntity): Promise<ContractEntity> {
    const data = entity.toData();
    
    const saved = await this.db
      .insert(contracts)
      .values(data)
      .returning();

    return ContractEntity.fromData(saved[0]);
  }

  async findById(id: string, companyId: string): Promise<ContractEntity | null> {
    const data = await this.db
      .select()
      .from(contracts)
      .where(
        and(
          eq(contracts.id, id),
          or(
            eq(contracts.cateringId, companyId),
            eq(contracts.clientId, companyId),
          ),
        ),
      )
      .limit(1);

    return data.length ? ContractEntity.fromData(data[0]) : null;
  }

  async findActiveByCompanies(
    cateringId: string,
    clientId: string,
  ): Promise<ContractEntity | null> {
    const data = await this.db
      .select()
      .from(contracts)
      .where(
        and(
          eq(contracts.cateringId, cateringId),
          eq(contracts.clientId, clientId),
          eq(contracts.status, 'ACTIVE'),
        ),
      )
      .limit(1);

    return data.length ? ContractEntity.fromData(data[0]) : null;
  }
}
```

---

## Module Structure

### Consistent Organization

Each feature module follows this structure:

```
src/modules/contract/
├── domain/
│   ├── entities/
│   │   └── contract.entity.ts       # ContractEntity with behavior
│   ├── errors/
│   │   ├── invalid-contract-state.error.ts
│   │   ├── duplicate-contract.error.ts
│   │   └── index.ts
│   ├── repositories/
│   │   └── contract.repository.interface.ts  # Abstract port
│   ├── services/
│   │   └── contract-rules.service.ts         # Pure domain logic
│   ├── events/
│   │   ├── contract-created.event.ts
│   │   ├── contract-paused.event.ts
│   │   └── index.ts
│   └── index.ts
│
├── application/
│   ├── usecases/
│   │   ├── create-contract/
│   │   │   ├── create-contract.usecase.ts
│   │   │   ├── create-contract.dto.ts
│   │   │   └── create-contract.response.ts
│   │   ├── pause-contract/
│   │   ├── resume-contract/
│   │   ├── terminate-contract/
│   │   └── index.ts
│   ├── handlers/
│   │   ├── contract-created.handler.ts    # Event handler
│   │   └── index.ts
│   ├── mappers/
│   │   └── contract.mapper.ts             # Entity ↔ DTO
│   ├── ports/
│   │   └── contract.service.port.ts       # Service interface
│   └── index.ts
│
├── infrastructure/
│   ├── controllers/
│   │   └── contract.controller.ts
│   ├── persistence/
│   │   └── contract.repository.ts         # Drizzle implementation
│   ├── dtos/
│   │   ├── create-contract.dto.ts
│   │   ├── contract-detail.dto.ts
│   │   └── index.ts
│   └── index.ts
│
├── contract.module.ts                     # NestJS module definition
└── index.ts                               # Public exports
```

### Why This Structure?

| Benefit | Impact |
|---------|--------|
| **Vertical Slicing** | Feature is self-contained (easier to move/delete) |
| **Layer Isolation** | Domain logic never imports infrastructure |
| **Clear Dependencies** | Easy to trace data flow |
| **Testing** | Each layer has clear test patterns |
| **Onboarding** | New dev knows exactly where to look for X |

---

## Data Flow

### Complete Example: Creating a Contract

```
1. PRESENTATION (Controller receives HTTP request)
   ├─ Validates input with class-validator
   └─ Extracts authenticated company from JWT

2. APPLICATION (UseCase orchestrates)
   ├─ Calls domain repository to check uniqueness
   ├─ Creates ContractEntity (domain logic runs here)
   ├─ Calls infrastructure repository to persist
   └─ Publishes domain event

3. DOMAIN (Business logic)
   ├─ ContractEntity validates internal invariants
   └─ Enforces state machine (can only create ACTIVE)

4. INFRASTRUCTURE (Persistence)
   ├─ Repository.save() executes SQL INSERT
   ├─ Event persisted to outbox table (same transaction)
   └─ Both succeed or both fail (ACID)

5. BACKGROUND (Event processor)
   ├─ Outbox processor polls for new events
   ├─ Publishes to event bus
   └─ Handlers execute (e.g., send notification)

6. RESPONSE (Controller returns HTTP)
   └─ Maps ContractEntity to DTO + returns 201 Created
```

### Request/Response Cycle

```typescript
// 1. HTTP Request arrives
POST /api/contracts
{
  "cateringId": "cat-123",
  "clientId": "cli-456",
  "serviceDays": [1, 2, 3, 4, 5],
  "minDailyQuantity": 10,
  "defaultQuantity": 50,
  "maxQuantity": 100,
  "startDate": "2026-03-01",
  "endDate": "2026-12-31"
}

// 2. Controller parses & calls UseCase
const result = await createContractUseCase.execute({
  ...data,
  cateringId: authenticatedCompany.id,
});

// 3. UseCase returns discriminated union
type Result = 
  | { ok: true; contract: ContractEntity }
  | { ok: false; error: DomainError; code: ErrorCode }

// 4. Controller checks discriminator
if (!result.ok) {
  throw new HttpException(
    { error: result.code, message: result.error.message },
    400,
  );
}

// 5. Map to DTO for response
const response = ContractMapper.toDTO(result.contract);

// 6. Return 201 with Location header
return {
  statusCode: 201,
  data: response,
  headers: { Location: `/api/contracts/${response.id}` },
};
```

---

## Event-Driven Patterns

### 1. Transactional Outbox Pattern

**Problem**: How to ensure events are delivered exactly-once without external queues?

**Solution**: Store events in database alongside data changes

```
┌─────────────────────────────────────────────────────────┐
│           Service (UseCase)                              │
│                                                          │
│  BEGIN TRANSACTION                                       │
│    1. Insert/Update contracts row                       │
│    2. Insert event to outbox_events table               │
│  COMMIT                                                  │
│                                                          │
│  If either fails → entire transaction rolls back        │
│  Both succeed or neither succeed → no orphaned events   │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│           Outbox Processor (Background Job)             │
│                                                          │
│  Every 5 seconds:                                        │
│    1. Query outbox_events where status = 'PENDING'     │
│    2. Publish to EventBus                              │
│    3. Update status to 'PROCESSED'                      │
│                                                          │
│  Backoff exponential on failure → max 5 retries        │
│  → status = 'DEAD' (dead letter queue)                 │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│           Event Handlers (Subscribers)                  │
│                                                          │
│  When contract.created event published:                │
│    1. Query processed_events (idempotency)             │
│    2. Execute handler logic                            │
│    3. Mark as processed                                │
│    4. If handler fails → event stays in outbox         │
└─────────────────────────────────────────────────────────┘
```

### 2. Domain Events

**What**: Events that represent something significant happened in the domain

**Where**: Published by entities, handled by infrastructure

```typescript
// Domain event (pure data)
export class ContractCreatedEvent {
  constructor(
    public readonly contractId: string,
    public readonly cateringId: string,
    public readonly clientId: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

// Published by entity/usecase
contract = ContractEntity.create(data);
await eventPublisher.publish(new ContractCreatedEvent(
  contract.id,
  contract.cateringId,
  contract.clientId,
));

// Handled by infrastructure (e.g., send notification)
@EventsHandler(ContractCreatedEvent)
export class ContractCreatedHandler implements IEventHandler<ContractCreatedEvent> {
  constructor(private emailService: EmailService) {}

  async handle(event: ContractCreatedEvent) {
    await this.emailService.sendContractCreated(event.cateringId);
  }
}
```

### 3. Event Bus Architecture

```typescript
// Infrastructure (singleton)
export class InMemoryEventBus {
  private handlers = new Map<string, IEventHandler[]>();

  subscribe<T extends DomainEvent>(
    eventType: Type<T>,
    handler: IEventHandler<T>,
  ) {
    const key = eventType.name;
    if (!this.handlers.has(key)) {
      this.handlers.set(key, []);
    }
    this.handlers.get(key)!.push(handler);
  }

  async publish<T extends DomainEvent>(event: T) {
    const key = event.constructor.name;
    const handlers = this.handlers.get(key) || [];
    
    // Execute all handlers (in parallel or sequentially based on config)
    await Promise.all(handlers.map(h => h.handle(event)));
  }
}
```

### 4. Idempotency

**Challenge**: Handler might run twice (network retry, race condition)

**Solution**: Track processed events in database

```typescript
// Infrastructure
export class IdempotentEventHandler {
  async handle<T extends DomainEvent>(
    event: T,
    handler: (event: T) => Promise<void>,
  ): Promise<void> {
    const eventKey = `${event.constructor.name}:${event.id}`;
    
    // Check if already processed
    const processed = await this.db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.eventKey, eventKey))
      .limit(1);
    
    if (processed.length) {
      return; // Already handled, skip
    }

    // Execute handler
    await handler(event);

    // Mark as processed
    await this.db.insert(processedEvents).values({
      eventKey,
      processedAt: new Date(),
    });
  }
}
```

---

## Authorization Model

### Multi-Tenant Auth Strategy

**Core Principle**: Company-level authentication, not user-level

```typescript
// JWT Payload
interface JwtPayload {
  sub: string;              // Company ID (not User ID)
  email: string;
  companyType: 'CATERING' | 'CLIENT';
  iat: number;
  exp: number;
}

// Extracted on each request
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    
    try {
      const payload = this.jwtService.verify(token);
      request.company = { id: payload.sub, type: payload.companyType };
      return true;
    } catch (error) {
      return false;
    }
  }
}
```

### Company Type Authorization

```typescript
// Decorator: restrict to specific company type
@RequireCompanyType('CLIENT')
@Post('contracts/:id/confirm-expected')
async confirmExpected(
  @Param('id') serviceId: string,
  @GetCompany() company: CompanyEntity,
): Promise<ServiceDayDetailResponse> {
  // Only CLIENT companies can confirm expected quantities
  // ...
}

// Guard implementation
@Injectable()
export class CompanyTypeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const requiredTypes = Reflect.getMetadata(
      'requireCompanyType',
      handler,
    );
    
    if (!requiredTypes) return true; // No restriction

    const request = context.switchToHttp().getRequest();
    const company = request.company;
    
    return requiredTypes.includes(company.type);
  }
}
```

### Contract-Level Authorization

```typescript
// Each operation validates contract ownership
async confirmServiceDayExpected(
  serviceId: string,
  companyId: string,
  quantity: number,
): Promise<ConfirmResult> {
  // 1. Get service day
  const service = await this.serviceDayRepo.findById(serviceId);
  
  // 2. Get contract
  const contract = await this.contractRepo.findById(service.contractId);
  
  // 3. Verify company is CLIENT of this contract
  if (contract.clientId !== companyId) {
    throw new ForbiddenException();
  }
  
  // 4. Verify contract is ACTIVE
  if (contract.status !== 'ACTIVE') {
    throw new InvalidContractStateError();
  }
  
  // 5. Execute domain logic
  service.confirmExpectedQuantity(quantity, contract.noticeHours);
  
  // 6. Persist
  return this.serviceDayRepo.save(service);
}
```

### Future: Role-Based Access Control (RBAC)

Current design is prepared for RBAC expansion:

```typescript
// Future: Include roles in JWT
interface JwtPayload {
  sub: string;              // Company ID
  userId: string;           // Will be added
  roles: ['ADMIN' | 'MANAGER' | 'EMPLOYEE']; // Will enforce
}

// Future: RolesGuard
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const requiredRoles = Reflect.getMetadata('roles', handler);
    
    if (!requiredRoles) return true;
    
    const request = context.switchToHttp().getRequest();
    const userRoles = request.user.roles;
    
    return requiredRoles.some(role => userRoles.includes(role));
  }
}

// Usage
@Roles('ADMIN', 'MANAGER')
@Patch('companies/:id')
async updateCompany(
  @Param('id') id: string,
  @Body() dto: UpdateCompanyDto,
) {
  // Only ADMIN or MANAGER can update
}
```

---

## Database Architecture

### Schema Organization

```sql
-- Identity & Tenancy
companies (id, company_type, email, status, created_at)
catering_profiles (company_id, daily_capacity)
client_profiles (company_id, work_mode)
client_office_days (company_id, day_of_week)

-- Authentication
users (id, company_id, role, is_active, email, password_hash)
refresh_tokens (id, user_id, token_hash, expires_at)
password_reset_tokens (id, email, token_hash, expires_at)

-- Core Business
contracts (id, catering_id, client_id, status, service_days, min_quantity, etc.)
contract_service_days (id, contract_id, day_of_week)
service_days (id, contract_id, date, expected_quantity, served_quantity)

-- Events & Messaging
outbox_events (id, aggregate_id, event_type, payload, status, retry_count)
processed_events (id, event_key, processed_at)
```

### Indexing Strategy

```sql
-- Fast lookup by company (tenancy)
CREATE INDEX idx_companies_email ON companies(email);

-- Service days queries
CREATE INDEX idx_service_days_contract_date 
  ON service_days(contract_id, service_date DESC);

-- Outbox processing
CREATE INDEX idx_outbox_status_retry 
  ON outbox_events(status, retry_count)
  WHERE status = 'PENDING';

-- Preventing duplicate contracts
CREATE UNIQUE INDEX idx_unique_active_contract
  ON contracts(catering_id, client_id)
  WHERE status = 'ACTIVE';
```

### Multi-Tenancy Data Isolation

**Strategy**: Row-level security via application logic (not PostgreSQL RLS)

```typescript
// Every query is scoped to authenticated company
async getContracts(companyId: string) {
  return this.db
    .select()
    .from(contracts)
    .where(
      or(
        eq(contracts.cateringId, companyId),
        eq(contracts.clientId, companyId),
      ),
    );
}

// Contract is visible if company is:
// - Catering (contracts.cateringId = companyId)
// - Client (contracts.clientId = companyId)
// 
// No cross-tenant data leakage possible
```

---

## Design Patterns Used

### 1. Repository Pattern

```typescript
// Domain: Abstract port
export interface IContractRepository {
  findById(id: string): Promise<ContractEntity | null>;
  save(entity: ContractEntity): Promise<ContractEntity>;
}

// Infrastructure: Concrete implementation
@Injectable()
export class DrizzleContractRepository implements IContractRepository {
  constructor(private db: Database) {}
  
  async save(entity: ContractEntity): Promise<ContractEntity> {
    const saved = await this.db.insert(contracts).values(entity.toData());
    return ContractEntity.fromData(saved[0]);
  }
}
```

### 2. Mapper/Adapter Pattern

```typescript
// Convert between layers without leaking domain objects
export class ContractMapper {
  static toDTO(entity: ContractEntity): ContractDetailDTO {
    const data = entity.toData();
    return {
      id: data.id,
      cateringName: data.cateringName, // Computed from entity
      clientName: data.clientName,
      serviceDaysPerWeek: data.serviceDays.length,
      status: data.status,
      // Never expose internal state
    };
  }

  static toPersistence(entity: ContractEntity): ContractRow {
    return entity.toData();
  }
}
```

### 3. Value Object Pattern

```typescript
// Immutable, compared by value (not identity)
export class DateRange {
  constructor(
    readonly start: Date,
    readonly end: Date,
  ) {
    if (start >= end) {
      throw new InvalidDateRangeError();
    }
  }

  contains(date: Date): boolean {
    return date >= this.start && date < this.end;
  }

  overlaps(other: DateRange): boolean {
    return this.start < other.end && other.start < this.end;
  }

  // Value objects use structural equality
  equals(other: DateRange): boolean {
    return this.start.getTime() === other.start.getTime()
      && this.end.getTime() === other.end.getTime();
  }
}
```

### 4. State Machine Pattern

```typescript
export type ContractStatus = 'ACTIVE' | 'PAUSED' | 'TERMINATED';

export class ContractEntity {
  private status: ContractStatus;

  // State transitions are guarded
  pause(): void {
    if (this.status !== 'ACTIVE') {
      throw new InvalidTransitionError(
        `Cannot pause from ${this.status}`
      );
    }
    this.status = 'PAUSED';
  }

  resume(): void {
    if (this.status !== 'PAUSED') {
      throw new InvalidTransitionError(
        `Cannot resume from ${this.status}`
      );
    }
    this.status = 'ACTIVE';
  }

  terminate(): void {
    if (this.status === 'TERMINATED') {
      throw new InvalidTransitionError('Already terminated');
    }
    this.status = 'TERMINATED';
  }
}
```

### 5. Specification Pattern

```typescript
// Query builder using specifications
export abstract class Specification<T> {
  abstract toSql(): SQL;
  abstract isSatisfiedBy(entity: T): boolean;
}

export class ActiveContractsSpec extends Specification<ContractEntity> {
  toSql(): SQL {
    return eq(contracts.status, 'ACTIVE');
  }

  isSatisfiedBy(entity: ContractEntity): boolean {
    return entity.status === 'ACTIVE';
  }
}

// Usage
const spec = new ActiveContractsSpec();
const activeContracts = await this.db
  .select()
  .from(contracts)
  .where(spec.toSql());
```

### 6. Factory Pattern

```typescript
// Domain: Create valid entities
export class ContractFactory {
  static create(data: CreateContractData): ContractEntity {
    // Validate all invariants before creating
    if (data.startDate >= data.endDate) {
      throw new InvalidDatesError();
    }
    if (data.minQuantity > data.defaultQuantity) {
      throw new InvalidQuantityError();
    }

    const entity = new ContractEntity({
      id: generateId(),
      ...data,
      status: 'ACTIVE',
      createdAt: new Date(),
    });

    return entity;
  }
}
```

---

## Dependency Injection

### NestJS Module Structure

```typescript
// contract.module.ts
@Module({
  controllers: [ContractController],
  providers: [
    // Use Cases
    CreateContractUseCase,
    PauseContractUseCase,
    ResumeContractUseCase,
    TerminateContractUseCase,

    // Services
    ContractQueryService,
    ContractReportService,

    // Repositories
    {
      provide: 'ContractRepository',
      useClass: DrizzleContractRepository,
    },

    // Event Handlers
    ContractCreatedHandler,
    ContractPausedHandler,

    // Mappers
    ContractMapper,
  ],
  exports: [
    ContractQueryService,
    ContractReportService,
  ],
})
export class ContractModule {}
```

### Inversion of Control

```typescript
// Service depends on abstract port, not concrete implementation
export class ContractQueryService {
  constructor(
    @Inject('ContractRepository')
    private repository: IContractRepository,
  ) {}

  async getContractDetails(id: string): Promise<ContractDetailDTO> {
    const entity = await this.repository.findById(id);
    return ContractMapper.toDTO(entity);
  }
}

// Easy to swap implementations for testing
const mockRepository = mock<IContractRepository>();
const service = new ContractQueryService(mockRepository);
```

---

## Testing Architecture

### Test Pyramid

```
        ▲
       /│\
      / │ \    E2E Tests (2)
     /  │  \   - Real HTTP requests
    /───┼───\  - Full stack integration
   /    │    \
  / Integration \ (7 test files)
 / Tests        \ - Database + Domain
/────────────────\ - In-memory event bus
│                │
│  Unit Tests    │ (14+ test files)
│  (266 passing) │ - Isolated logic
│                │ - Mocked dependencies
└────────────────┘
```

### Unit Test Pattern

```typescript
// domain/__tests__/contract.entity.test.ts

describe('ContractEntity', () => {
  let entity: ContractEntity;

  beforeEach(() => {
    entity = new ContractEntity({
      id: 'contract-123',
      status: 'ACTIVE',
      serviceDays: [],
      // ... other fields
    });
  });

  describe('pause()', () => {
    it('should transition from ACTIVE to PAUSED', () => {
      entity.pause();
      expect(entity.status).toBe('PAUSED');
    });

    it('should throw if not ACTIVE', () => {
      entity.pause(); // Now PAUSED
      expect(() => entity.pause()).toThrow(InvalidTransitionError);
    });
  });

  describe('getFinancialMetrics()', () => {
    it('should calculate cost per person correctly', () => {
      const metrics = entity.getFinancialMetrics();
      expect(metrics.costPerPerson).toBe(entity.totalCost / entity.servings);
    });
  });
});
```

### Integration Test Pattern

```typescript
// application/usecases/__tests__/create-contract.integration.test.ts

describe('CreateContractUseCase (Integration)', () => {
  let useCase: CreateContractUseCase;
  let repository: ContractRepository;
  let eventBus: InMemoryEventBus;
  let db: Database;

  beforeAll(async () => {
    // Start test database
    db = await setupTestDatabase();
  });

  beforeEach(async () => {
    // Clear tables
    await db.delete(contracts).execute();
    await db.delete(outboxEvents).execute();

    // Inject real repository with test DB
    repository = new DrizzleContractRepository(db);
    eventBus = new InMemoryEventBus();
    useCase = new CreateContractUseCase(repository, eventBus);
  });

  it('should create contract and persist to database', async () => {
    const result = await useCase.execute(validCreateData);

    expect(result.ok).toBe(true);
    
    // Verify persisted to database
    const saved = await repository.findById(result.contract.id);
    expect(saved).toBeDefined();
    expect(saved.cateringId).toBe(validCreateData.cateringId);
  });

  it('should prevent duplicate active contracts', async () => {
    // First creation succeeds
    const first = await useCase.execute(validCreateData);
    expect(first.ok).toBe(true);

    // Second with same companies fails
    const second = await useCase.execute(validCreateData);
    expect(second.ok).toBe(false);
    expect(second.code).toBe('DUPLICATE_CONTRACT');
  });
});
```

### E2E Test Pattern

```typescript
// __tests__/e2e/contract.e2e.test.ts

describe('Contract Endpoints (E2E)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Login and get token
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    token = response.body.token;
  });

  it('POST /contracts should create and return 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId: 'cli-456',
        serviceDays: [1, 2, 3, 4, 5],
        minQuantity: 10,
        defaultQuantity: 50,
        startDate: '2026-03-01',
        endDate: '2026-12-31',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.status).toBe('ACTIVE');
  });

  it('GET /contracts/:id should return contract details', async () => {
    // Create a contract first
    const createRes = await request(app.getHttpServer())
      .post('/api/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send(validCreateData);

    const contractId = createRes.body.id;

    // Fetch it
    const getRes = await request(app.getHttpServer())
      .get(`/api/contracts/${contractId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(contractId);
  });
});
```

---

## Summary

ChefOps architecture demonstrates:

1. **Clear Separation of Concerns** - Each layer has single responsibility
2. **Framework Independence** - Business logic lives in domain layer
3. **Testability** - Layers can be tested in isolation
4. **Scalability** - Event-driven design, efficient queries, multi-tenant support
5. **Maintainability** - Consistent patterns, clear dependencies, comprehensive tests
6. **Production Readiness** - Error handling, logging, monitoring, deployment strategy

The architecture is not over-engineered—each pattern serves a specific purpose in solving the business problem.

---

<p align="center">
  <sub>Architecture Guide for ChefOps - A Master's thesis project in Clean Architecture & DDD</sub>
</p>
