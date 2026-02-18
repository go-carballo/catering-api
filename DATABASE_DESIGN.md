# Database Design & Schema
## Data Model, Relationships, and Optimization

---

## Table of Contents

1. [Overview](#overview)
2. [Entity-Relationship Diagram](#entity-relationship-diagram)
3. [Schema Definition](#schema-definition)
4. [Data Types & Constraints](#data-types--constraints)
5. [Indexes & Optimization](#indexes--optimization)
6. [Multi-Tenancy Isolation](#multi-tenancy-isolation)
7. [Normalization Analysis](#normalization-analysis)
8. [Query Patterns](#query-patterns)
9. [Backup & Recovery](#backup--recovery)
10. [Migration Strategy](#migration-strategy)

---

## Overview

### Database Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **RDBMS** | PostgreSQL | 16.x |
| **ORM** | Drizzle | 0.29.x |
| **Schema** | TypeScript-first (Drizzle schema) | — |
| **Migrations** | Drizzle migrations (SQL) | — |

### Design Principles

1. **Normalization**: Third Normal Form (3NF) for data integrity
2. **Multi-tenancy**: Row-level isolation via company scoping
3. **Performance**: Strategic indexes on hot paths
4. **Auditability**: `createdAt`, `updatedAt` timestamps on all tables
5. **Soft deletes**: `deletedAt` flag instead of hard deletion

### Table Count & Size Estimates

| Table | Estimated Rows (1 year) | Size | Growth |
|-------|------------------------|------|--------|
| `companies` | 500 | ~50KB | 1-2 per day |
| `users` | 500 | ~40KB | ~500 |
| `contracts` | 2,500 | ~500KB | 5-10 per day |
| `service_days` | 650,000 | ~80MB | ~1,800 per day |
| `outbox_events` | 100,000 | ~50MB | ~270 per day |
| **Total** | **~750,000** | **~250MB** | — |

---

## Entity-Relationship Diagram

### Simplified ER Diagram

```
┌─────────────────────────────┐
│       companies             │
├─────────────────────────────┤
│ id (PK)                     │
│ email (UNIQUE)              │
│ name                        │
│ company_type (ENUM)         │ ──┐
│ status (ENUM)               │   │
│ created_at, updated_at      │   │
└─────────────────────────────┘   │
         │                         │
         ├─ 1:1 ──┐              │
         │        │              │
         │    ┌────────────────────┼──────────────────┐
         │    │                    │                  │
         ▼    ▼                    ▼                  ▼
    ┌──────────────┐    ┌──────────────────┐  ┌──────────────┐
    │catering_     │    │ client_profiles  │  │    users     │
    │profiles      │    │                  │  │              │
    ├──────────────┤    ├──────────────────┤  ├──────────────┤
    │company_id(FK)│    │ company_id (FK)  │  │ id (PK)      │
    │daily_        │    │ work_mode        │  │ company_id(FK)
    │capacity      │    │                  │  │ role, email  │
    └──────────────┘    └──────────────────┘  │ is_active    │
                                 │             └──────────────┘
                        ┌────────┴────────┐
                        ▼                 ▼
                ┌──────────────────┐  ┌──────────────────┐
                │client_office_days│  │    contracts     │
                ├──────────────────┤  ├──────────────────┤
                │ id (PK)          │  │ id (PK)          │
                │ company_id (FK)  │  │ catering_id (FK) │
                │ day_of_week      │  │ client_id (FK)   │
                │ is_work_day      │  │ status (ENUM)    │
                └──────────────────┘  │ service_days     │
                                      │ min/default/max  │
                                      │ notice_hours     │
                                      └────────┬─────────┘
                                               │
                                ┌──────────────┼──────────────┐
                                ▼              ▼              ▼
                        ┌──────────────────────┐   ┌──────────────────┐
                        │ contract_service_days│   │  service_days    │
                        ├──────────────────────┤   ├──────────────────┤
                        │ id (PK)              │   │ id (PK)          │
                        │ contract_id (FK)     │   │ contract_id (FK) │
                        │ day_of_week (1-7)    │   │ date             │
                        │ (which days active)  │   │ expected_qty     │
                        └──────────────────────┘   │ served_qty       │
                                                   │ confirmed_at     │
                                                   └──────────────────┘
```

### Event-Driven Tables

```
┌──────────────────────────┐     ┌──────────────────────────┐
│   outbox_events          │     │  processed_events        │
├──────────────────────────┤     ├──────────────────────────┤
│ id (PK)                  │     │ id (PK)                  │
│ aggregate_id             │     │ event_key (UNIQUE)       │
│ event_type               │     │ processed_at             │
│ payload (JSON)           │     │ handler_name             │
│ status (PENDING/...)     │  ◄──┤                          │
│ retry_count              │     └──────────────────────────┘
│ created_at               │
│ next_retry_at            │
└──────────────────────────┘
```

### Authentication Tables

```
┌──────────────────────────┐     ┌──────────────────────────┐
│   refresh_tokens         │     │ password_reset_tokens    │
├──────────────────────────┤     ├──────────────────────────┤
│ id (PK)                  │     │ id (PK)                  │
│ user_id (FK)             │     │ email                    │
│ token_hash (bcrypt)      │     │ token_hash (bcrypt)      │
│ expires_at               │     │ expires_at (15 min)      │
│ created_at               │     │ created_at               │
│ revoked_at (nullable)    │     └──────────────────────────┘
└──────────────────────────┘
```

---

## Schema Definition

### 1. Companies Table (Multi-Tenant Root)

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  company_type ENUM('CATERING', 'CLIENT') NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL
);

COMMENT ON TABLE companies IS 
  'Root tenant table. Single Table Inheritance pattern with company_type enum.';
COMMENT ON COLUMN companies.email IS 
  'Unique per tenant, used for login and contact.';
COMMENT ON COLUMN companies.company_type IS 
  'Discriminator: CATERING or CLIENT. Determines which profile table is used.';
```

### 2. Catering Profiles (Extension)

```sql
CREATE TABLE catering_profiles (
  company_id UUID PRIMARY KEY REFERENCES companies(id),
  daily_capacity INT NOT NULL CHECK (daily_capacity > 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE catering_profiles IS 
  '1:1 extension of companies. Only exists if company_type = CATERING.';
COMMENT ON COLUMN catering_profiles.daily_capacity IS 
  'Maximum people catering can serve in one day. Used for capacity planning.';
```

### 3. Client Profiles (Extension)

```sql
CREATE TABLE client_profiles (
  company_id UUID PRIMARY KEY REFERENCES companies(id),
  work_mode ENUM('REMOTE', 'HYBRID', 'ONSITE') DEFAULT 'ONSITE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE client_profiles IS 
  '1:1 extension of companies. Only exists if company_type = CLIENT.';
COMMENT ON COLUMN client_profiles.work_mode IS 
  'Affects service day expectations. REMOTE = fewer people.';
```

### 4. Client Office Days

```sql
CREATE TABLE client_office_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  is_work_day BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, day_of_week)
);

COMMENT ON TABLE client_office_days IS 
  'Days of week this client office is open. Helps in forecasting (e.g., no service on weekends).';
```

### 5. Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN', 'MANAGER', 'EMPLOYEE') DEFAULT 'EMPLOYEE',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  UNIQUE(company_id, email)
);

COMMENT ON TABLE users IS 
  'Team members within a company. Currently: one user per company (JWT auth uses company_id).
   Future: multiple users per company with RBAC.';
COMMENT ON COLUMN users.role IS 
  'ADMIN: full access. MANAGER: reports/services. EMPLOYEE: basic. (Not enforced yet.)';
```

### 6. Contracts Table (Core Business)

```sql
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catering_id UUID NOT NULL REFERENCES companies(id),
  client_id UUID NOT NULL REFERENCES companies(id),
  status ENUM('ACTIVE', 'PAUSED', 'TERMINATED') DEFAULT 'ACTIVE',
  
  -- Service day configuration
  min_daily_quantity INT NOT NULL CHECK (min_daily_quantity > 0),
  default_quantity INT NOT NULL,
  max_quantity INT NOT NULL,
  notice_hours INT DEFAULT 24,
  
  -- Contract period
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date > start_date),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paused_at TIMESTAMP NULL,
  terminated_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL,
  
  -- Constraint: only one ACTIVE contract per catering/client pair
  UNIQUE(catering_id, client_id) 
    WHERE status = 'ACTIVE' AND deleted_at IS NULL
);

COMMENT ON TABLE contracts IS 
  'Core business entity. Represents agreement between catering and client company.
   State machine: ACTIVE ↔ PAUSED → TERMINATED (final).';
COMMENT ON COLUMN contracts.notice_hours IS 
  'How many hours CLIENT must confirm expected quantity before service date.';
```

### 7. Contract Service Days (Configuration)

```sql
CREATE TABLE contract_service_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(contract_id, day_of_week)
);

COMMENT ON TABLE contract_service_days IS 
  'Which days of week this contract is active. E.g., Monday-Friday only (1-5).
   Used during service day generation.';
```

### 8. Service Days (Actual Instances)

```sql
CREATE TABLE service_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  service_date DATE NOT NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  
  -- Client confirmation
  expected_quantity INT NOT NULL,
  expected_quantity_confirmed_at TIMESTAMP NULL,
  expected_quantity_confirmer_id UUID REFERENCES users(id),
  
  -- Catering confirmation
  served_quantity INT NULL,
  served_quantity_confirmed_at TIMESTAMP NULL,
  served_quantity_confirmer_id UUID REFERENCES users(id),
  
  -- Status tracking
  status ENUM('PENDING', 'EXPECTED_CONFIRMED', 'SERVED_CONFIRMED', 'DISPUTED') 
    DEFAULT 'PENDING',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(contract_id, service_date)
);

COMMENT ON TABLE service_days IS 
  'Individual service day instance. Two-phase confirmation: expected (CLIENT), served (CATERING).
   ~180 rows per contract per year.';
COMMENT ON COLUMN service_days.status IS 
  'Computed from confirmation timestamps. PENDING: no confirmations.
   EXPECTED_CONFIRMED: CLIENT confirmed. SERVED_CONFIRMED: both confirmed.';
```

### 9. Outbox Events (Transactional Outbox Pattern)

```sql
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  
  status ENUM('PENDING', 'PUBLISHED', 'PROCESSED', 'DEAD') 
    DEFAULT 'PENDING',
  
  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMP NULL,
  published_at TIMESTAMP NULL,
  processed_at TIMESTAMP NULL,
  error_message TEXT NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE outbox_events IS 
  'Event Sourcing outbox. Events are persisted BEFORE publishing, ensuring
   no lost events even if app crashes. Processor polls and publishes to event bus.';
COMMENT ON COLUMN outbox_events.status IS 
  'PENDING: not yet processed. PROCESSED: handler executed. DEAD: failed 5 times.';
```

### 10. Processed Events (Idempotency)

```sql
CREATE TABLE processed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key VARCHAR(500) UNIQUE NOT NULL,
  handler_name VARCHAR(255),
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE processed_events IS 
  'Idempotency ledger. Prevents duplicate handler execution if event is
   reprocessed due to network retry or outbox rerun.';
```

### 11. Refresh Tokens (Session Management)

```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL
);

COMMENT ON TABLE refresh_tokens IS 
  'Rotating refresh tokens. Stored as bcrypt hash (plaintext never persisted).
   Can be revoked (logged out) or mass-revoked (password changed).';
```

### 12. Password Reset Tokens (Self-Service)

```sql
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP NULL
);

COMMENT ON TABLE password_reset_tokens IS 
  'Temporary tokens for password reset. 15-minute expiry.
   Cannot be reused (used_at field).';
```

---

## Data Types & Constraints

### UUID for Primary Keys

**Why**: 
- Distributed-friendly (no sequence coordination)
- Privacy (harder to guess IDs)
- Globally unique without database coordination

```typescript
// Drizzle schema
export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  // ...
});
```

### ENUM Types

**Defined Enums**:
- `company_type`: CATERING | CLIENT
- `contract_status`: ACTIVE | PAUSED | TERMINATED
- `work_mode`: REMOTE | HYBRID | ONSITE
- `service_day_status`: PENDING | EXPECTED_CONFIRMED | SERVED_CONFIRMED | DISPUTED
- `outbox_status`: PENDING | PUBLISHED | PROCESSED | DEAD

**Why**:
- Type safety at database level
- Prevents invalid values
- Easier migration than string columns

### Timestamp Columns

**Standard on Every Table**:
```sql
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
deleted_at TIMESTAMP NULL  -- For soft deletes
```

**Why**:
- Audit trail
- Soft deletes preserve data
- Query by time (e.g., "created this week")

### CHECK Constraints

**Examples**:
```sql
-- Quantity must be positive
CHECK (daily_capacity > 0)
CHECK (min_daily_quantity > 0)

-- Date ranges
CHECK (end_date > start_date)

-- Day of week 1-7
CHECK (day_of_week BETWEEN 1 AND 7)
```

**Why**: Enforce business rules at database level

---

## Indexes & Optimization

### Primary Key Indexes (Automatic)

```sql
-- Automatically created
PRIMARY KEY (id)
```

### Foreign Key Indexes (Automatic)

```sql
-- Automatically created when defining FK
REFERENCES companies(id)
```

### Strategic Indexes

#### 1. Company Lookup (Login)

```sql
CREATE INDEX idx_companies_email ON companies(email);
```

**Query Pattern**:
```sql
SELECT * FROM companies WHERE email = ? AND deleted_at IS NULL;
```

**Cardinality**: ~500 (very selective)
**Impact**: Login speed

---

#### 2. Service Days by Contract & Date

```sql
CREATE INDEX idx_service_days_contract_date 
  ON service_days(contract_id, service_date DESC);
```

**Query Pattern**:
```sql
SELECT * FROM service_days 
WHERE contract_id = ? 
  AND service_date BETWEEN ? AND ?
ORDER BY service_date DESC;
```

**Cardinality**: High (millions of rows)
**Impact**: Contract dashboard, reports

---

#### 3. Outbox Processing

```sql
CREATE INDEX idx_outbox_status_retry 
  ON outbox_events(status, retry_count, next_retry_at)
  WHERE status IN ('PENDING', 'DEAD');
```

**Query Pattern**:
```sql
SELECT * FROM outbox_events 
WHERE status = 'PENDING' 
  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
ORDER BY created_at ASC
LIMIT 100;
```

**Impact**: Event processor performance

---

#### 4. Active Contract Uniqueness

```sql
CREATE UNIQUE INDEX idx_unique_active_contract
  ON contracts(catering_id, client_id)
  WHERE status = 'ACTIVE' AND deleted_at IS NULL;
```

**Why**: Enforces "only one active contract per pair" at database level
**Query Pattern**: Checked before creating new contract

---

#### 5. User Lookup by Company

```sql
CREATE INDEX idx_users_company_active 
  ON users(company_id, is_active)
  WHERE deleted_at IS NULL;
```

**Query Pattern**:
```sql
SELECT * FROM users 
WHERE company_id = ? AND is_active = TRUE AND deleted_at IS NULL;
```

---

#### 6. Refresh Token Validation

```sql
CREATE INDEX idx_refresh_tokens_user_revoked
  ON refresh_tokens(user_id, revoked_at)
  WHERE revoked_at IS NULL;
```

**Query Pattern**: Find valid tokens for user (e.g., mass revoke on password change)

---

### Index Summary

```sql
-- All indexes
\d+ companies
CREATE INDEX idx_companies_email ON companies(email);

\d+ service_days
CREATE INDEX idx_service_days_contract_date 
  ON service_days(contract_id, service_date DESC);

\d+ outbox_events
CREATE INDEX idx_outbox_status_retry 
  ON outbox_events(status, retry_count, next_retry_at)
  WHERE status IN ('PENDING', 'DEAD');

\d+ contracts
CREATE UNIQUE INDEX idx_unique_active_contract
  ON contracts(catering_id, client_id)
  WHERE status = 'ACTIVE' AND deleted_at IS NULL;

\d+ users
CREATE INDEX idx_users_company_active 
  ON users(company_id, is_active)
  WHERE deleted_at IS NULL;

\d+ refresh_tokens
CREATE INDEX idx_refresh_tokens_user_revoked
  ON refresh_tokens(user_id, revoked_at)
  WHERE revoked_at IS NULL;
```

### Query Performance Expectations

| Query | Index | Expected Speed |
|-------|-------|-----------------|
| Login by email | `idx_companies_email` | <1ms |
| Service days for contract | `idx_service_days_contract_date` | <10ms |
| Process outbox | `idx_outbox_status_retry` | <5ms |
| Check duplicate contract | `idx_unique_active_contract` | <1ms (constraint) |
| List company users | `idx_users_company_active` | <5ms |
| Revoke tokens | `idx_refresh_tokens_user_revoked` | <2ms |

---

## Multi-Tenancy Isolation

### Data Isolation Strategy

**Company-scoped queries** (application-level enforcement):

```typescript
// WRONG: leaks data
async findAllContracts() {
  return this.db.query('SELECT * FROM contracts');
}

// RIGHT: scoped to authenticated company
async findContractsByCompany(companyId: string) {
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

### Multi-Tenancy Patterns

| Pattern | Implementation | Pros | Cons |
|---------|---|---|---|
| **Row-level (Ours)** | App scopes every query | Transparent, testable | Must remember scoping |
| **RLS** | PostgreSQL policy | Automatic enforcement | Hard to debug, slower |
| **Separate DB** | One DB per tenant | Complete isolation | Operational complexity |
| **Separate Schema** | One schema per tenant | Good balance | Still complex |

**We chose Row-level** because:
- Easier to debug and test
- Simpler operations
- Database-agnostic
- Works with any ORM

### Risk Mitigation

```typescript
// Repository base class enforces scoping
abstract class BaseRepository<T> {
  protected async withCompanyScope<R>(
    companyId: string,
    query: (scope: string) => Promise<R>,
  ): Promise<R> {
    // All repositories inherit this
    // Forces explicit company scope parameter
    return query(companyId);
  }
}

// TypeScript makes it hard to forget
async getContracts(companyId: string) {
  // If you don't pass companyId, TypeScript errors
  // If you query without scoping, code review catches it
}
```

---

## Normalization Analysis

### Third Normal Form (3NF) Compliance

#### Company Data (Normalized ✅)

```
companies → catering_profiles (1:1, no data duplication)
companies → client_profiles (1:1, no data duplication)
companies → users (1:N, single source of truth)
```

**No anomalies**: Data inconsistencies prevented by design

#### Contract Data (Normalized ✅)

```
contracts → contract_service_days (N:M, join table)
contracts → service_days (1:N, fact table)
```

**Why**: Each entity has single responsibility
- `contracts` stores agreement
- `contract_service_days` stores which days active
- `service_days` stores actual instances

#### Strategic Denormalization (Minimal)

```sql
-- Example: catering_profiles.daily_capacity
-- Could compute from contracts, but:
-- 1. Frequently queried
-- 2. Doesn't change often
-- 3. No update anomalies (separate table)
```

**Decision**: Denormalize only when:
- Query is on hot path
- Data changes infrequently
- Update logic is simple

---

## Query Patterns

### 1. Dashboard Query (Client)

```sql
-- Get financial metrics for CLIENT
SELECT 
  c.id,
  c.client_id,
  SUM(sd.expected_quantity) as total_expected,
  SUM(sd.served_quantity) as total_served,
  COUNT(*) as days_count,
  (SUM(sd.expected_quantity) * 15) as estimated_cost
FROM contracts c
LEFT JOIN service_days sd ON c.id = sd.contract_id
WHERE c.client_id = $1
  AND c.status = 'ACTIVE'
  AND sd.service_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY c.id;
```

**Index used**: `idx_service_days_contract_date`
**Expected rows**: 5-50 contracts × 30 days = 150-1500 rows
**Expected time**: <100ms

---

### 2. Service Day Confirmation (Batch)

```sql
-- Get unconfirmed service days for CLIENT
SELECT sd.id, sd.contract_id, sd.service_date, 
       c.notice_hours, c.default_quantity
FROM service_days sd
JOIN contracts c ON sd.contract_id = c.id
WHERE c.client_id = $1
  AND sd.expected_quantity_confirmed_at IS NULL
  AND sd.service_date > CURRENT_DATE
  AND c.status = 'ACTIVE'
ORDER BY sd.service_date ASC;
```

**Index used**: `idx_service_days_contract_date`
**Expected rows**: 5-50
**Expected time**: <20ms

---

### 3. Report Query (Weekly Summary)

```sql
-- Generate weekly report
SELECT 
  sd.service_date,
  sd.expected_quantity,
  sd.served_quantity,
  (sd.served_quantity * 15) as cost
FROM service_days sd
WHERE sd.contract_id = $1
  AND sd.service_date BETWEEN $2 AND $3
ORDER BY sd.service_date ASC;
```

**Index used**: `idx_service_days_contract_date`
**Expected rows**: 5-7 (one week)
**Expected time**: <5ms

---

### 4. Scheduler Query (Generate Upcoming Days)

```sql
-- Get active contracts for service day generation
SELECT DISTINCT c.id, c.client_id, c.catering_id,
       c.min_daily_quantity, c.default_quantity
FROM contracts c
LEFT JOIN contract_service_days csd ON c.id = csd.contract_id
WHERE c.status = 'ACTIVE'
  AND c.start_date <= CURRENT_DATE
  AND c.end_date > CURRENT_DATE
  AND (csd.day_of_week = EXTRACT(DOW FROM CURRENT_DATE)
       OR csd.day_of_week IS NULL);
```

**Index used**: No specific index (small result set)
**Expected rows**: 10-50 contracts
**Expected time**: <50ms

---

## Backup & Recovery

### Backup Strategy

```bash
# Daily automated backup (Railway PostgreSQL)
# - Time: 02:00 UTC daily
# - Retention: 30 days
# - Location: Railway managed backup storage

# Point-in-time recovery available
# - Can restore to any timestamp in last 30 days
# - Useful for accidental deletes

# Manual backup before major migrations
pg_dump postgresql://user:pass@host/db \
  --file=backup-$(date +%Y%m%d).sql \
  --verbose
```

### Recovery Procedures

**Full Database Restore**:
```bash
# Stop app
docker-compose down

# Restore from backup
psql -U postgres < backup-20260218.sql

# Verify
psql -d catering_db -c "SELECT COUNT(*) FROM contracts;"

# Restart
docker-compose up
```

**Point-in-Time Recovery** (via Railway dashboard):
1. Go to PostgreSQL instance
2. Click "Backup" tab
3. Select timestamp to restore to
4. Confirm (database will restart)

---

## Migration Strategy

### Schema Changes (Drizzle)

```typescript
// 1. Define schema change
export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email').unique().notNull(),
  name: varchar('name').notNull(),
  // NEW COLUMN
  phone: varchar('phone'),  // Add optional phone
  companyType: enum('company_type', ['CATERING', 'CLIENT']).notNull(),
});

// 2. Generate migration
pnpm run migrate:generate

// Creates: drizzle/0002_add_phone.sql
```

### Migration Execution

```bash
# Dev
pnpm run migrate

# Production (Railway)
# Via GitHub: Merge to main → deploy → migrations run automatically
```

### Zero-Downtime Migrations

**Safe**: Adding nullable column
```sql
ALTER TABLE companies ADD COLUMN phone VARCHAR(20) NULL;
-- No downtime, writes work during migration
```

**Risky**: Dropping column
```sql
ALTER TABLE companies DROP COLUMN phone;
-- If app still reads it: errors during migration
-- Solution: Deploy app change first, then drop column
```

### Rollback Strategy

**For Drizzle** (no built-in rollback):
```bash
# 1. Keep old migration files
# 2. If needed, create "reverse" migration
#    ALTER TABLE companies DROP COLUMN phone;
# 3. Run reverse migration
pnpm run migrate
```

**Best practice**: Always test migrations on staging first

---

## Monitoring & Performance

### Slow Query Log

```sql
-- Enable in PostgreSQL
ALTER SYSTEM SET log_min_duration_statement = 1000; -- 1 second

-- View slow queries
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
WHERE mean_time > 100  -- > 100ms
ORDER BY mean_time DESC;
```

### Connection Pooling

```typescript
// Drizzle with Hikari-style pooling (managed by NestJS)
const db = new drizzle(pool);

// Max 10 connections to database
// If exceeded: queue requests, don't create new connections
```

### Disk Space

```sql
-- Check database size
SELECT 
  datname,
  pg_size_pretty(pg_database_size(datname))
FROM pg_database
WHERE datname = 'catering_db';
```

**Expected**:
- Year 1: ~250MB
- Year 5: ~1.2GB (still manageable)
- Archive old events after 1 year if needed

---

<p align="center">
  <sub>Database Design for ChefOps - Schema, Relationships, Optimization, and Operations</sub>
</p>
