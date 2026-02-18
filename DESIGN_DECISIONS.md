# Design Decisions & Trade-Offs
## Why We Built ChefOps This Way

---

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [Database Design](#database-design)
3. [API Design](#api-design)
4. [Event Handling](#event-handling)
5. [Scheduling & Automation](#scheduling--automation)
6. [Frontend Architecture](#frontend-architecture)
7. [Testing Strategy](#testing-strategy)
8. [Deployment](#deployment)

---

## Authentication & Authorization

### Decision 1: Company-Level Auth Instead of User-Level Auth

**What We Did**: JWT payload contains `sub: companyId` instead of `userId`

```typescript
// Our approach
{ sub: 'company-123', email: 'catering@example.com', companyType: 'CATERING' }

// Alternative (user-level)
{ sub: 'user-456', email: 'manager@catering.com', userId: 'user-456' }
```

**Why**:
- **Simplicity**: One user per company (current business requirement)
- **Multi-tenancy clarity**: All queries automatically scoped by company
- **Pivot point**: Ready to add multi-user support—just add `userId` to payload later
- **Security**: Can't accidentally leak another company's data

**Trade-offs**:
- ❌ Can't have multiple team members per company (yet—easy to fix)
- ❌ Can't track which user performed which action (future enhancement)
- ✅ Simpler authorization logic today
- ✅ Smaller JWT token
- ✅ Fewer database queries

**When to Reconsider**: If catering companies need team access before next quarter, add `userId` and implement RolesGuard.

---

### Decision 2: No Role-Based Access Control (RBAC) Today

**What We Did**: Defined roles in database (ADMIN, MANAGER, EMPLOYEE) but don't enforce them

**Why**:
- **User stories don't require it**: Current design works with one user per company
- **Architecture prepared**: Adding RolesGuard is 30 minutes of work
- **Avoid over-engineering**: YAGNI principle—build it when you need it
- **Focus on core logic**: Contract lifecycle is the hard problem, not RBAC

**What We Could Do**:
```typescript
// Future: Add roles enforcement
@Roles('ADMIN', 'MANAGER')
@Patch('companies/:id/users/:userId')
async deactivateUser() { /* ... */ }

@Injectable()
export class RolesGuard implements CanActivate {
  // Check JWT roles against @Roles() decorator
}
```

**Trade-offs**:
- ❌ No role-based restrictions today
- ❌ Can't assign employees "read-only" access
- ✅ Simpler system to understand
- ✅ No premature authorization complexity
- ✅ Foundation is flexible

---

### Decision 3: Refresh Token Rotation with bcrypt Hashing

**What We Did**: 
- Access tokens valid 24 hours
- Refresh tokens valid 7 days (or 30 with "remember me")
- Refresh tokens stored as bcrypt hash (not plaintext)

**Why**:
- **Standard practice**: JWT alone isn't enough for long sessions
- **Security**: Stolen token is useless without knowing original value
- **Revocation**: Can invalidate all tokens by clearing table
- **Session tracking**: Can track when user last authenticated

**Implementation**:
```typescript
// Login creates refresh token
const refreshToken = generateSecureToken(); // Random 32 bytes
const hash = bcrypt.hash(refreshToken);
await db.insert(refreshTokens).values({
  id: uuid(),
  userId: user.id,
  tokenHash: hash,
  expiresAt: now + 7.days,
});

// Client stores refresh token in localStorage
// When access token expires, POST /refresh with refresh token
// Server validates: bcrypt.compare(refreshToken, storedHash)
// Return new access token
```

**Trade-offs**:
- ✅ Secure even if database leaked
- ✅ Can revoke all sessions by deleting tokens
- ✅ No extra auth service needed
- ❌ Need to store hash (vs just checking expiry)
- ❌ Slightly slower auth (bcrypt is intentionally slow)

---

## Database Design

### Decision 1: Single `companies` Table with `company_type` Enum (STI Pattern)

**What We Did**: 
```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  company_type ENUM('CATERING', 'CLIENT'),
  email VARCHAR,
  name VARCHAR,
  -- ... more fields
);

CREATE TABLE catering_profiles (
  company_id UUID PRIMARY KEY,
  daily_capacity INT,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE TABLE client_profiles (
  company_id UUID PRIMARY KEY,
  work_mode ENUM('REMOTE', 'HYBRID', 'ONSITE'),
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
```

**Why**:
- **Single Table Inheritance (STI)**: Both company types share most columns
- **Polymorphic queries**: Can query all companies without UNION
- **Extensibility**: Adding new company types is just a new enum value
- **Simplicity**: No complex JOINs for basic company queries

**Alternative: Separate Tables**
```sql
CREATE TABLE caterings (...);
CREATE TABLE clients (...);
-- Would need UNION for "all contracts involving any company"
-- Harder to add new company types later
```

**Trade-offs**:
- ✅ Simple queries: `SELECT * FROM companies`
- ✅ Polymorphic design: Add new company type in one line
- ✅ Profile tables are 1:1, never NULL in main table
- ❌ Slightly more complex to understand
- ❌ Can't enforce unique constraints across types (solved with UNIQUE + PARTIAL INDEX)

---

### Decision 2: No Row-Level Security (RLS) - App-Level Filtering

**What We Did**: Every query includes company scoping in application code

```typescript
// Repository
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
```

**Why**:
- **Simpler debugging**: Can inspect raw data without RLS rules
- **Better performance**: Can optimize indexes for specific queries
- **Testability**: Easier to mock and test data access
- **Framework agnostic**: Not locked into PostgreSQL RLS syntax

**Alternative: PostgreSQL RLS**
```sql
-- Would look like:
CREATE POLICY tenant_isolation ON contracts
  USING (catering_id = current_user_id OR client_id = current_user_id);
```

**Disadvantages of RLS**:
- Harder to debug (data might be hidden)
- Complex to test (need different database users)
- PostgreSQL-specific (can't migrate to MySQL)
- Slower for large datasets (filters after reading)

**Trade-offs**:
- ✅ Transparent data access control
- ✅ Database-agnostic
- ✅ Easier testing
- ❌ Developer can accidentally forget the scoping
  - *Mitigated by: Code review, TypeScript typing, tests*

---

### Decision 3: Normalized Schema (3NF) with Strategic Denormalization

**What We Did**: 
- Fully normalized core schema (contracts, service_days)
- Minimal denormalization for performance (see below)

```sql
-- Normalized: only ID stored, data fetched via JOIN
CREATE TABLE service_days (
  id UUID PRIMARY KEY,
  contract_id UUID REFERENCES contracts(id),
  service_date DATE,
  expected_quantity INT,
  served_quantity INT
);

-- Not denormalized (would duplicate):
-- (client_name, catering_name in every row—violates 3NF)
```

**When We Denormalize**: Only when query performance demands it

```sql
-- Example: Catering profile includes daily_capacity
-- Could be computed from contracts, but:
-- - Frequently queried
-- - Doesn't change often
-- - Justified by read-heavy workload
CREATE TABLE catering_profiles (
  company_id UUID PRIMARY KEY,
  daily_capacity INT,  -- Denormalized for quick dashboard query
  updated_at TIMESTAMP
);
```

**Trade-offs**:
- ✅ Data integrity enforced by schema
- ✅ Easy to reason about relationships
- ✅ Avoids duplicate data bugs
- ❌ Requires JOINs (mitigated by indexes)
- ❌ Must track denormalized fields on updates

---

## API Design

### Decision 1: REST Endpoints, Not GraphQL

**What We Did**: RESTful architecture with `/contracts`, `/service-days`, etc.

```
GET    /contracts           # List
GET    /contracts/:id       # Detail
POST   /contracts           # Create
PATCH  /contracts/:id       # Update (partial)
POST   /contracts/:id/pause # Action endpoint
```

**Why**:
- **Simpler for beginners**: No query language to learn
- **Better caching**: HTTP caching headers work naturally
- **Monitoring**: Every endpoint is clearly visible
- **Pragmatic**: 90% of use cases fit REST perfectly
- **Stateless**: Each request is independent

**Alternative: GraphQL**
```graphql
query {
  contracts(filter: { status: ACTIVE }) {
    id
    catering { name }
    serviceDays { date quantity }
  }
}
```

**Why Not GraphQL**:
- Over-complexity for this domain
- Caching is harder (no GET cache headers)
- Over-fetching is rare (frontend knows what it needs)
- N+1 queries (need DataLoader to fix)
- Learning curve for team

**Trade-offs**:
- ✅ Simple, predictable API
- ✅ HTTP caching works
- ✅ Standard HTTP semantics
- ❌ Can't fetch exactly what you want (minor issue in practice)
- ❌ Multiple requests for related data (solved by careful endpoint design)

---

### Decision 2: Discriminated Union Results for Use Cases

**What We Did**: Use cases return discriminated unions instead of throwing exceptions

```typescript
type CreateContractResult = 
  | { ok: true; contract: ContractEntity }
  | { ok: false; error: DomainError; code: ErrorCode };

const result = await useCase.execute(data);
if (result.ok) {
  return { statusCode: 201, body: result.contract };
} else {
  return { statusCode: 400, body: { error: result.code } };
}
```

**Why**:
- **Type-safe error handling**: TypeScript forces you to handle both cases
- **No exceptions for control flow**: Exceptions should be exceptional
- **Clear semantics**: Expected errors vs. unexpected errors
- **Performance**: No stack trace overhead for expected failures
- **Logging**: Easy to differentiate business errors vs. bugs

**Alternative: Exceptions**
```typescript
try {
  const contract = await useCase.execute(data);
  return { statusCode: 201, body: contract };
} catch (error) {
  if (error instanceof DuplicateContractError) {
    return { statusCode: 400, body: { error: 'DUPLICATE' } };
  }
  throw error; // Unexpected
}
```

**Why Not Exceptions for Control Flow**:
- Stack traces are slow and noisy
- Exceptions = unexpected (not for validation failures)
- Easy to forget edge cases
- TypeScript can't verify you've handled all cases

**Trade-offs**:
- ✅ Type-safe error handling
- ✅ Clear code paths
- ✅ Better logging
- ❌ More verbose than throwing
  - *Mitigated by: Good IDE autocomplete*
- ❌ Unfamiliar pattern to some developers
  - *Mitigated by: Clear documentation and examples*

---

### Decision 3: Pagination for List Endpoints (Offset-Based)

**What We Did**: `GET /contracts?page=2&limit=20`

**Why**:
- **Standard**: Every API does this
- **Simple to implement**: No cursor logic needed
- **Simple to use**: Frontend just shows page 1, 2, 3
- **Works with REST**: Natural HTTP semantics

```typescript
@Get()
async list(
  @Query('page') page: number = 1,
  @Query('limit') limit: number = 20,
  @GetCompany() company: CompanyEntity,
) {
  const offset = (page - 1) * limit;
  const contracts = await this.repository.findMany(
    company.id,
    { offset, limit },
  );
  const total = await this.repository.count(company.id);
  
  return {
    data: contracts,
    pagination: { page, limit, total, pages: ceil(total / limit) },
  };
}
```

**Trade-offs**:
- ✅ Simple, standard approach
- ✅ Works for small datasets (our use case)
- ❌ Gets slow if someone deletes items (offset shifts)
  - *Solution: Cursor-based pagination for future scale*

---

## Event Handling

### Decision 1: Transactional Outbox + In-Memory Event Bus

**What We Did**: 
1. Events stored in database during domain changes (same transaction)
2. Outbox processor publishes to in-memory event bus
3. Event handlers execute in-process

**Why**:
- **Guaranteed delivery**: If app crashes before event processed, outbox still has it
- **No external queue needed**: No Kafka/RabbitMQ infrastructure
- **ACID**: Data change + event persisted atomically
- **Idempotency**: Track processed events to avoid duplicates
- **Simple**: In-memory bus is easier than message queue

**Architecture**:
```
UseCase: CREATE CONTRACT
  └─ Save to contracts table
  └─ Save event to outbox_events (same transaction)
  
Outbox Processor (every 5 seconds):
  └─ Query outbox_events where status='PENDING'
  └─ Publish to EventBus
  └─ Event handlers execute
  └─ Mark event as PROCESSED
  
If handler fails:
  └─ Retry with exponential backoff
  └─ After 5 retries: status='DEAD'
  └─ Operator can retry manually
```

**Trade-offs**:
- ✅ No external infrastructure (Kafka, RabbitMQ)
- ✅ Guaranteed delivery
- ✅ Idempotency built-in
- ✅ Simple to understand
- ❌ In-process handlers only (can't fan out to other services)
  - *Solution: Add Kafka publisher as new event handler*
- ❌ Handlers must complete quickly (blocking processing)
  - *Mitigated by: Async handlers, queuing in handler*

---

### Decision 2: Dead Letter Queue for Failed Events

**What We Did**: Track failed events, manually retry them

```typescript
// Outbox processor
const event = await outbox.find(id);
try {
  await this.eventBus.publish(event);
  event.status = 'PROCESSED';
} catch (error) {
  event.retryCount++;
  if (event.retryCount >= 5) {
    event.status = 'DEAD';
    console.error(`Event ${id} moved to dead letter queue`);
  } else {
    // Exponential backoff
    event.nextRetryAt = now + Math.pow(2, event.retryCount) * 1000;
  }
}
```

**Why**:
- **Observable**: Operators can see failed events
- **Safe**: Doesn't hide problems or crash silently
- **Fixable**: Can fix handler and retry
- **Metrics**: Can alert on DLQ size

**When to Use**:
- Email handler fails (email service down)
- Webhook fails (external API down)
- Database locked (temporary contention)

**When Not to Use**:
- If it's a code bug, it'll fail every retry anyway—fix the code instead

**Trade-offs**:
- ✅ Observable failure mode
- ✅ Operator can fix and retry
- ✅ Events aren't lost silently
- ❌ Requires manual intervention for stuck events
  - *Mitigated by: Good alerting and runbooks*

---

## Scheduling & Automation

### Decision 1: Advisory Locks for Distributed Scheduler

**What We Did**: Use PostgreSQL advisory locks to ensure only one instance runs the scheduler

```typescript
// Any number of app instances can run, only one actually executes
async generateServiceDays() {
  const lockId = 123456; // Fixed ID for this scheduler task
  const acquired = await this.db.selectOne(
    sql`SELECT pg_try_advisory_lock(${lockId})`
  );

  if (!acquired) {
    return; // Another instance is running
  }

  try {
    // Do expensive work...
    await this.generateUpcomingDays();
  } finally {
    await this.db.selectOne(
      sql`SELECT pg_advisory_unlock(${lockId})`
    );
  }
}

// Run on every instance in background job
// Only one will succeed and execute
```

**Why**:
- **No external dependency**: Redis, Zookeeper, etc. not needed
- **Database as source of truth**: Uses what we already have
- **Fair**: Multiple instances race fairly
- **Recovers from failures**: Lock expires after 60s if instance crashes

**Trade-offs**:
- ✅ Simple, no extra infrastructure
- ✅ Database as single source of truth
- ✅ Automatic recovery
- ❌ Only works with PostgreSQL (for now)
  - *Workaround: Elect leader in application code*
- ❌ Polling-based (every instance polls)
  - *Mitigated by: Job runs every 24h, overhead is minimal*

---

### Decision 2: Proactive 7-Day Service Day Generation

**What We Did**: Daily job generates service days for all active contracts 7 days ahead

```typescript
// Every day at 00:00 UTC
async generateUpcomingServiceDays() {
  const contracts = await this.contractRepo
    .findAll({ status: 'ACTIVE' });

  for (const contract of contracts) {
    // Generate for next 7 days
    const dates = getNext7Days(today);
    
    for (const date of dates) {
      // Skip if already exists
      const exists = await this.serviceDayRepo
        .findByContractAndDate(contract.id, date);
      
      if (exists) continue;

      // Create with default quantity
      const day = ServiceDayEntity.create({
        contractId: contract.id,
        date,
        expectedQuantity: contract.defaultQuantity,
        servedQuantity: null,
      });

      await this.serviceDayRepo.save(day);
    }
  }
}
```

**Why**:
- **Predictability**: CLIENT always sees upcoming days to confirm
- **Fallback mechanism**: If CLIENT doesn't confirm by notice period, use default
- **Reduces manual work**: No need to manually create each day
- **Forecasting**: Catering can see week ahead

**Trade-offs**:
- ✅ Proactive, not reactive
- ✅ Reduces manual work
- ✅ Better forecasting
- ❌ What if contract is paused? Need to check status
  - *Mitigated by: Check status in query*
- ❌ What if we need more than 7 days? 
  - *Mitigated by: Can run job on-demand, or increase days*

---

### Decision 3: Fallback Quantity for Unconfirmed Days

**What We Did**: If CLIENT doesn't confirm by notice period deadline, use `minDailyQuantity`

```typescript
// Scheduled job runs every hour
async applyFallbackForUnconfirmed() {
  const now = new Date();
  
  // Find unconfirmed service days past their notice period
  const unconfirmed = await this.serviceDayRepo.find({
    expectedQuantityConfirmedAt: null,
    confirmationDeadlineAt: { $lt: now },
  });

  for (const day of unconfirmed) {
    const contract = await this.contractRepo.findById(day.contractId);
    
    // Apply fallback
    day.expectedQuantity = contract.minDailyQuantity;
    day.expectedQuantityConfirmedAt = now; // Mark as confirmed
    
    await this.serviceDayRepo.save(day);
  }
}
```

**Why**:
- **Business requirement**: Catering needs minimum forecast even if CLIENT doesn't confirm
- **Prevents surprises**: Catering won't show up with 0 people to serve
- **Fair**: Uses contract-agreed minimum, not arbitrary number
- **Automatic**: No manual intervention needed

**Trade-offs**:
- ✅ Prevents surprises
- ✅ Fair (uses contract minimum)
- ✅ Automatic
- ❌ CLIENT might be unhappy with forced quantity
  - *Mitigated by: Contract defines minimum—agreed upfront*

---

## Frontend Architecture

### Decision 1: Next.js App Router (Not Pages Router)

**What We Did**: Use modern App Router with route groups

```typescript
// Structure
app/
├── layout.tsx              # Root layout
├── page.tsx               # Landing page (/)
├── login/                 # Public route
│   └── page.tsx
└── (protected)/           # Route group for auth guard
    ├── layout.tsx        # Shows sidebar + auth check
    ├── dashboard/page.tsx
    ├── contracts/page.tsx
    └── contracts/[id]/service-days/page.tsx
```

**Why**:
- **Modern React**: Server Components reduce bundle size
- **Layout composition**: Shared layouts without file naming hacks
- **Type safety**: Built on TypeScript
- **Performance**: Automatic code splitting, optimized for Web Vitals
- **Route groups**: `/contracts` and `/(protected)/contracts` both work

**Alternative: Pages Router (Legacy)**
```typescript
// Would look like:
pages/
├── index.tsx
├── login.tsx
├── dashboard.tsx
├── contracts.tsx
// Harder to manage auth, shared layouts
```

**Trade-offs**:
- ✅ Modern, performance-focused
- ✅ Server Components reduce JS
- ✅ Better DX with route groups
- ❌ Learning curve (Server Components confusing at first)
- ❌ Can't use old Next.js patterns

---

### Decision 2: TanStack React Query for Data Fetching

**What We Did**: Use React Query for server state, Context for UI state

```typescript
// Query keys factory
const contractKeys = {
  all: ['contracts'] as const,
  list: () => [...contractKeys.all, 'list'],
  detail: (id: string) => [...contractKeys.all, 'detail', id],
};

// Hook
export function useContracts() {
  return useQuery({
    queryKey: contractKeys.list(),
    queryFn: () => contractsService.getAll(),
    staleTime: 60_000, // 1 minute
  });
}

// Component
export function ContractsList() {
  const { data, isLoading, error } = useContracts();
  
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorState error={error} />;
  
  return <ContractsTable data={data} />;
}
```

**Why**:
- **Cache management**: Automatic cache invalidation
- **Deduplication**: Multiple components = one request
- **Background refetch**: Keep data fresh without user interaction
- **Offline support**: Works with network status
- **DevTools**: Debugging queries is easy

**Alternative: Fetch + useState**
```typescript
// Would look like:
const [contracts, setContracts] = useState([]);
useEffect(() => {
  fetch('/api/contracts')
    .then(res => res.json())
    .then(setContracts);
}, []);
// Lots of boilerplate, no deduplication, manual cache
```

**Trade-offs**:
- ✅ Powerful caching
- ✅ Automatic refetch
- ✅ Great DevTools
- ❌ Learning curve (query keys confusing)
- ❌ Bundle size (~40KB)
  - *Mitigated by: Modern bundling (code split)*

---

### Decision 3: shadcn/ui + Tailwind (Not Component Library)

**What We Did**: Use unstyled Radix components + Tailwind CSS

```typescript
// shadcn/ui: gives you the code, not a black box
// You own the styling, can customize everything

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function MyButton() {
  return (
    <Button 
      variant="outline" 
      className={cn('rounded-lg', customClass)}
    >
      Click me
    </Button>
  );
}
```

**Why**:
- **Code ownership**: You get the source code, not a closed component
- **Customizable**: Tailwind classes are infinitely flexible
- **No CSS-in-JS overhead**: Pure Tailwind
- **Standard**: Radix is the standard for accessible primitives
- **Small bundle**: Only include what you use

**Alternative: Material UI (Black Box)**
```typescript
// MUI: proprietary component library
// Hard to customize, large bundle, CSS-in-JS overhead
import { Button } from '@mui/material';

<Button variant="contained">Looks exactly like everyone else's</Button>
```

**Trade-offs**:
- ✅ Fully customizable
- ✅ Code ownership
- ✅ Small bundle
- ✅ Looks professional (new-york theme)
- ❌ More CSS to write (mitigated by: Tailwind utilities)
- ❌ Can't drag-drop components (mitigated by: Code generation tools)

---

## Testing Strategy

### Decision 1: Test Pyramid (Unit > Integration > E2E)

**What We Did**: 266+ tests distributed across layers

```
        ▲
       /│\
      / │ \    E2E (2 files)
     /  │  \   - Real HTTP, full stack
    /───┼───\
   /    │    \ Integration (7 files)
  /     │     \ - Database + Domain
 /──────┼──────\
│       │       │ Unit (14+ files)
│  Unit │       │ - Isolated logic
│ Tests │       │ - Mocked deps
└───────┴───────┘
```

**Why**:
- **Fast feedback**: Unit tests run in <100ms
- **Isolation**: Easy to debug failing unit test
- **Coverage**: Integration tests verify layer interactions
- **Confidence**: E2E tests verify end-to-end flow
- **Economics**: More unit tests (cheap) than E2E tests (expensive)

**How We Distribute**:
- **Unit**: Domain logic, pure functions, entity behavior
- **Integration**: Repository queries, use case workflows, event handling
- **E2E**: API endpoints, authentication, complete flows

**Trade-offs**:
- ✅ Balanced coverage
- ✅ Fast feedback loop
- ✅ Good bang for buck
- ❌ Need to test integration between layers (mitigated by: integration tests)

---

### Decision 2: Skip Frontend Page-Level Tests (For Now)

**What We Did**: Test dashboard components (unit), not pages (E2E)

```typescript
// ✅ We test components
// lib/currency-formatter.test.ts
// components/dashboard/budget-card.test.tsx
// components/dashboard/kpis-grid.test.tsx

// ❌ We don't test pages
// app/(protected)/dashboard/page.tsx (not tested)
// app/(protected)/contracts/page.tsx (not tested)
```

**Why**:
- **Time trade-off**: Backend test coverage prioritized
- **Lower risk**: Pages are thin wrapper around hooks + components
- **Cost/benefit**: E2E tests for pages are expensive (slow, flaky)
- **Frontend changes often**: Testing pages = maintenance burden

**When to Add Page Tests**:
- If pages have complex business logic (ours don't—logic is in hooks/services)
- If you want Playwright E2E tests (separate from unit tests)
- If client demands 90%+ coverage

**Trade-offs**:
- ✅ Faster to develop
- ✅ Backend deeply tested
- ✅ Lower maintenance burden
- ❌ No guarantee pages actually work (mitigated by: manual testing + small attack surface)

---

## Deployment

### Decision 1: Railway for Backend, Vercel for Frontend

**What We Did**: Split deployment to optimize for each

```
Frontend: Vercel
  ├─ Benefits: Free tier, auto-scaling, edge functions, analytics
  ├─ Deploy: git push → GitHub webhook → auto-deploy
  
Backend: Railway
  ├─ Benefits: Dockerfile support, PostgreSQL managed, secrets manager
  ├─ Deploy: git push → Railway webhook → auto-build & deploy
  
Database: Railway PostgreSQL
  ├─ Managed service, automated backups, one-click restore
```

**Why**:
- **Optimal for each**: Frontend benefits from Vercel's edge, backend from Railway's flexibility
- **No lock-in**: Both support standard containers
- **Cost**: Both have generous free tiers
- **Simplicity**: One-click deployment, managed databases

**Alternative: Monorepo on Single Platform**
```
# Would work, but:
# - Vercel is optimized for frontend (Node.js slower)
# - Railway excellent for both, but no edge functions
# - Heroku/DigitalOcean: more expensive
```

**Trade-offs**:
- ✅ Optimal for each layer
- ✅ Cost-effective
- ✅ Simple deployment
- ❌ Two platforms to manage
  - *Mitigated by: Both have webhooks + GitHub integration*

---

### Decision 2: GitHub Actions for CI/CD

**What We Did**: Automated testing on PR, merge to dev = auto-deploy staging

```yaml
# On every PR
- Run linter, typecheck, unit tests
- Generate test report

# Merge to main (manual for prod)
- Run all tests
- Build Docker image
- Push to Registry
- Manual deploy to Railway (for safety)

# Merge to dev (auto-deploy staging)
- Run all tests
- Build & deploy to Railway staging
```

**Why**:
- **Standard**: GitHub Actions is tightly integrated with GitHub
- **Free**: Included with repository
- **Flexible**: Can run any command
- **Observable**: Status visible on PR
- **Automated**: Dev deployments are automatic, prod are manual

**Trade-offs**:
- ✅ Zero cost
- ✅ Tight integration with GitHub
- ✅ Observable status
- ❌ YAML syntax is verbose (mitigated by: templates, documentation)

---

## Summary: Key Trade-Offs

| Decision | Pros | Cons | Revisit When |
|----------|------|------|------------------|
| Company-level auth | Simple, secure | No multi-user (yet) | Need team access |
| No RBAC | Simpler system | Can't enforce roles | Roles matter for business |
| REST, not GraphQL | Simple, cacheable | Multiple requests | Over-fetching is common |
| Transactional Outbox | Guaranteed delivery, no infra | In-process only | Need multi-service arch |
| Advisory locks | No external dep | PostgreSQL only | Need Redis anyway |
| React Query | Great caching, DX | Bundle size | Performance issues |
| Next.js App Router | Modern, performant | Learning curve | Happy with current setup |
| Railway + Vercel | Optimal for each | Multiple platforms | Need consolidation |
| App-level security | Transparent, testable | Manual enforcement | Forgot scoping bug |

---

<p align="center">
  <sub>Design Decisions for ChefOps - Rationale, Trade-Offs, and When to Reconsider</sub>
</p>
