# ChefOps: Multi-Tenant Catering Management Platform
## Master's Thesis Project Overview

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Goals](#project-goals)
3. [Business Context](#business-context)
4. [Technical Achievements](#technical-achievements)
5. [System Architecture](#system-architecture)
6. [Key Innovations](#key-innovations)
7. [Project Structure](#project-structure)
8. [Documentation Map](#documentation-map)
9. [Evaluation Criteria](#evaluation-criteria)
10. [Conclusion](#conclusion)

---

## Executive Summary

**ChefOps** is a production-grade, multi-tenant SaaS platform for managing catering contracts and service operations. Designed for distribution between catering companies and their client organizations, the system handles the complete lifecycle of catering relationships: from contract negotiation to service scheduling, quantity confirmation, and financial reporting.

### Key Metrics

| Metric | Value |
|--------|-------|
| **Codebase Size** | ~15,000 lines of TypeScript |
| **Test Coverage** | 266+ passing tests (unit, integration, e2e) |
| **Database Tables** | 12 normalized tables |
| **API Endpoints** | 32+ REST endpoints with comprehensive error handling |
| **Core Design Pattern** | Clean Architecture with Domain-Driven Design |
| **Deployment** | Production-ready on Railway (backend) & Vercel (frontend) |
| **User Roles** | 3 defined (ADMIN, MANAGER, EMPLOYEE) |
| **Company Types** | 2 (CATERING, CLIENT) with distinct features |

---

## Project Goals

### Educational Objectives

1. **Demonstrate Clean Architecture at Scale**
   - Real separation of concerns across domain, application, and infrastructure layers
   - Not just folder structure—actual business logic isolation

2. **Implement Domain-Driven Design (DDD) Principles**
   - Rich domain entities with behavior, not just data
   - Ubiquitous language shared between business and code
   - Aggregate roots with invariant protection

3. **Apply Enterprise Integration Patterns**
   - Transactional Outbox Pattern for guaranteed event delivery
   - Distributed saga/choreography for multi-step workflows
   - Advisory locks for safe distributed scheduling

4. **Design for Multi-Tenancy from Day One**
   - Isolated data per tenant (company)
   - Minimal cross-tenant coupling
   - Scalable authorization model

5. **Prioritize Code Quality & Testability**
   - Type-safe TypeScript with strict mode
   - Comprehensive testing (unit, integration, e2e)
   - Predictable, observable behavior

### Business Objectives

1. **Solve Real Domain Problem**
   - Catering companies struggle to coordinate with multiple clients
   - Need automated scheduling, confirmation workflows, and reporting
   - Financial reconciliation between what was planned vs. served

2. **Provide Value-Add Features**
   - Dashboard with finance metrics (budget vs. actual spend)
   - Automated service day generation (7-day lookahead)
   - Weekly reporting with CSV/PDF export
   - Session management with inactivity detection

3. **Enable Scalability**
   - Support hundreds of catering companies and thousands of clients
   - Efficient database queries with proper indexing
   - Event-driven architecture ready for future integrations

---

## Business Context

### The Catering Industry Problem

Catering companies typically manage contracts with multiple corporate clients. The operational challenges include:

- **Planning Complexity**: Confirming how many people will be served each day (varies weekly)
- **Confirmation Chaos**: Back-and-forth emails to confirm expected vs. actual quantities
- **Financial Uncertainty**: Difficulty tracking costs vs. revenue, spotting cost deviations
- **Manual Reporting**: Tedious weekly/monthly reconciliation and reporting
- **Scaling Friction**: Manual processes break down with 10+ active contracts

### ChefOps Solution

| Challenge | Solution |
|-----------|----------|
| Confirmation chaos | Service Day workflow with CLIENT confirmation, CATERING verification |
| Manual scheduling | Automated generation of 7-day lookahead service days |
| Cost deviations | Dashboard KPIs: cost/person, utilization rate, variance alerts |
| Manual reporting | Weekly JSON reports + CSV/PDF export |
| Scaling friction | Automated scheduler + event-driven architecture |

### Market Positioning

- **Primary Users**: Catering companies (CATERING tenant) + their corporate clients (CLIENT tenants)
- **Company Types**: 
  - **CATERING**: Manage multiple contracts, confirm served quantities, see operational metrics
  - **CLIENT**: Manage corporate office days, confirm expected quantities, monitor budget/spend
- **Each company has ONE user** (per security model)—but platform supports additional users for future RBAC

---

## Technical Achievements

### 1. Clean Architecture Implementation

The system is organized into **3 vertical layers per module** (not just horizontal tiers):

```
Module Structure:
├── Domain          → Entities, value objects, domain errors, business rules
├── Application     → Services, DTOs, use cases, event handlers
└── Infrastructure  → Controllers, repositories, external adapters
```

**Why This Matters for Evaluation**:
- Business logic is completely independent of frameworks
- Easy to test domain rules without mocking HTTP or databases
- Clear dependency flow: Infrastructure depends on Application, Application on Domain
- Actual defense against framework lock-in

### 2. Domain-Driven Design (DDD)

**Rich Domain Entities** (not just data holders):

```typescript
// NOT just getters/setters, but actual domain logic
class ContractEntity {
  ensureActive(): void { /* guards against invalid state */ }
  pause(): void { /* enforces state machine rules */ }
  getFinancialMetrics(): Metrics { /* pure business calculation */ }
}
```

**Result Types Instead of Exceptions for Control Flow**:

```typescript
// Type-safe, discriminated unions prevent logic errors
type CreateContractResult = 
  | { status: 'success'; contract: ContractEntity }
  | { status: 'error'; code: 'INVALID_DATES' | 'DUPLICATE_CONTRACT' };
```

### 3. Transactional Outbox Pattern

**Problem Solved**: How to ensure events are delivered exactly-once without external dependencies?

**Solution**: 
- Domain events are persisted to database alongside data changes
- Outbox processor polls at regular intervals (5-second cadence)
- Idempotency via processed events tracking
- Dead letter queue for failed events

**Code Impact**:
```typescript
// Inside transaction: data change + event in same ACID boundary
async createContract(data) {
  const contract = new ContractEntity(data);
  await saveToDatabase(contract);
  await saveToOutbox({ type: 'contract.created', aggregate: contract });
  // Both succeed or both fail - no orphaned events
}
```

### 4. Distributed Scheduling Without External Dependencies

**Challenge**: Generate service days proactively across multiple server instances without message queues

**Solution**: PostgreSQL advisory locks
```typescript
// Only one instance locks and executes scheduler
const lock = await postgres.tryLock(`scheduler:service_days`);
if (lock) {
  await generateUpcomingServiceDays();
  await lock.release();
}
```

### 5. Type-Safe API & Data Layer

- **Drizzle ORM**: Type-safe SQL generation from TypeScript schema
- **Zod Validation**: Parse & validate data at boundaries
- **Discriminated Unions**: Use TypeScript's type system for control flow
- **Strict Mode**: All files compiled with `strict: true`

### 6. Frontend Architecture

- **Next.js App Router**: Modern, file-based routing with layout composition
- **Server Components**: Leverage server-side rendering for performance
- **React Query**: Intelligent caching and synchronization
- **Tailwind + shadcn/ui**: Component-based styling without CSS bloat
- **Service Layer**: Abstracted API client with automatic refresh token handling

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        END USERS                                │
│                                                                  │
│   Catering Companies      ↔     Client Organizations            │
│   (CATERING tenant)       ↔     (CLIENT tenant)                 │
└────────┬───────────────────────────────┬────────────────────────┘
         │                               │
         ↓                               ↓
┌────────────────────────────────┬────────────────────────────────┐
│         Frontend (Next.js)      │     Backend (NestJS)           │
│                                │                                │
│ • React 19 Components          │ • Modular Services             │
│ • TanStack Query Caching       │ • Domain Entities              │
│ • shadcn/ui Components         │ • Event Bus + Outbox           │
│ • Tailwind CSS                 │ • Scheduler (Advisory Locks)   │
│                                │ • JWT Auth + Guards            │
└────────┬───────────────────────┴──────────┬──────────────────────┘
         │                                  │
         └──────────────────┬───────────────┘
                            ↓
                   PostgreSQL 16 Database
                   (12 tables, multi-tenant)
```

### Module Dependencies

**Backend Modules** (organized by feature):

```
shared/
├── domain/          → Domain errors, ports, base classes
├── events/          → Event bus, domain events
├── outbox/          → Transactional outbox processor
├── guards/          → JWT, company type validation
└── infrastructure/  → Database, email, utilities

modules/
├── auth/            → Login, refresh tokens, password reset
├── user/            → User CRUD per company
├── catering/        → Catering company registration & profiles
├── client/          → Client company registration & profiles
├── contract/        → Contract lifecycle (ACTIVE→PAUSED→TERMINATED)
├── service-day/     → Service scheduling, confirmation, reporting
├── health/          → Health checks
└── seed/            → Test data seeding
```

### Data Flow Example: Creating a Contract

```
1. Frontend (React Hook Form)
   └─► Validates with Zod schema
   └─► POST /api/contracts

2. Backend (Controller)
   └─► Validates request with class-validator
   └─► Extracts company from JWT
   └─► Calls CreateContractUseCase

3. Use Case (Business Logic)
   └─► Domain: Contract.create() → ContractEntity
   └─► Validates dates, uniqueness, company authorization
   └─► Returns typed Result<ContractEntity | DomainError>

4. Repository (Infrastructure)
   └─► Inserts to contracts table
   └─► Inserts to outbox_events table
   └─► Both in single transaction

5. Event Handler (Infrastructure)
   └─► Outbox processor picks up event
   └─► Publishes to InMemoryEventBus
   └─► Event handlers execute (e.g., send notification)

6. Response (Controller)
   └─► Returns 201 Created with contract data
```

---

## Key Innovations

### 1. **Multi-Tenant Architecture with Company-Level Auth**

Traditional apps implement multi-tenancy at the row level (tenant_id filters). ChefOps uses **company-level authentication**:

- JWT payload contains `sub: companyId` (not userId)
- All queries automatically scoped to authenticated company
- CATERING companies see only their contracts
- CLIENT companies see only contracts they're part of
- One user per company (future-proofed for RBAC expansion)

### 2. **Service Day Automation with Fallback Rules**

Service days are auto-generated with intelligent fallback:

```typescript
// Daily job generates 7-day lookahead
// If CLIENT doesn't confirm by notice period deadline:
// Apply contract.minDailyQuantity as fallback
// Ensures catering has baseline forecast even without confirmation
```

This solves real business problem: preventing "surprise" zero-person days

### 3. **Finance Metrics Dashboard**

CLIENT companies see real-time financial KPIs:

```typescript
interface FinanceMetrics {
  totalBudget: number;           // Contract value
  totalSpent: number;            // Actual service days cost
  utilization: number;           // % of budget consumed
  costPerPerson: number;         // Average cost/meal
  deviation: number;            // % difference planned vs actual
  deviationAlert: boolean;       // Warn if deviation > threshold
}
```

### 4. **Type-Safe Result Pattern Instead of Exceptions**

```typescript
// Instead of throwing exceptions for expected business errors:
type ContractResult = 
  | { ok: true; contract: ContractEntity }
  | { ok: false; error: ContractError; code: ErrorCode };

// Caller must handle both cases - enforced by TypeScript
const result = await createContract(data);
if (!result.ok) {
  // Handle error - type checker ensures this
  return res.status(400).json({ error: result.error });
}
// Now we KNOW result.contract exists
```

### 5. **Distributed Scheduler Without Message Queue**

Advisory locks ensure only one instance executes the scheduler:

```typescript
// Safe to run on multiple replicas - only one actually executes
async generateServiceDays() {
  const acquired = await advisoryLock('scheduler:service_days');
  if (!acquired) return; // Another instance is running
  
  // Do expensive work...
  await releaselock();
}
```

---

## Project Structure

### Repository Organization

```
go-carballo/
├── catering-api/               # Backend (this directory)
│   ├── src/
│   │   ├── modules/           # Feature modules
│   │   └── shared/            # Cross-cutting concerns
│   ├── test/                  # Integration & E2E tests
│   ├── docker-compose.yml     # Local dev environment
│   ├── PROJECT_OVERVIEW.md    # Detailed project overview
│   ├── ARCHITECTURE.md        # Detailed architecture decisions
│   └── package.json
│
├── catering-frontend/          # Frontend (separate repo)
│   ├── src/
│   │   ├── app/              # Next.js routes
│   │   ├── components/       # React components
│   │   ├── hooks/            # Custom React hooks
│   │   └── services/         # API client layer
│   └── package.json
│
└── README.md (in parent)       # Quick reference
```

### Key Files & Their Purpose

| File | Purpose | Audience |
|------|---------|----------|
| `PROJECT_OVERVIEW.md` | Complete feature catalog | Everyone |
| `ARCHITECTURE.md` | Design patterns & decisions | Architects, evaluators |
| `DESIGN_DECISIONS.md` | Trade-offs explained | Evaluators, future maintainers |
| `API_DOCUMENTATION.md` | REST API reference | Frontend devs, API consumers |
| `DATABASE_DESIGN.md` | Schema, normalization, indexes | DB admins, backend devs |
| `SECURITY.md` | Auth, authorization, vulnerabilities | Security reviewers |
| `TESTING_STRATEGY.md` | Test pyramid, coverage analysis | QA, evaluators |
| `DEPLOYMENT_AND_OPS.md` | DevOps, CI/CD, monitoring | DevOps, SREs |

---

## Documentation Map

For a complete understanding of the system, read these documents in order:

### For Evaluators (Master's Committee)

1. **Start Here**: MASTER_THESIS.md (this document)
2. **Architecture**: ARCHITECTURE.md - Understand design patterns and layers
3. **Decisions**: DESIGN_DECISIONS.md - See trade-offs and reasoning
4. **Database**: DATABASE_DESIGN.md - Understand data model
5. **Security**: SECURITY.md - Review auth/authorization approach
6. **Testing**: TESTING_STRATEGY.md - Evaluate quality measures

### For Developers (Maintenance/Extension)

1. **Getting Started**: README.md (each repo)
2. **Project Overview**: PROJECT_OVERVIEW.md
3. **Architecture**: ARCHITECTURE.md
4. **API Docs**: API_DOCUMENTATION.md
5. **Development**: DEVELOPMENT_GUIDE.md
6. **Database**: DATABASE_DESIGN.md

### For DevOps/Operations

1. **Deployment**: DEPLOYMENT_AND_OPS.md
2. **Architecture** (Infra section): ARCHITECTURE.md
3. **Security**: SECURITY.md
4. **Development** (Docker section): DEVELOPMENT_GUIDE.md

---

## Evaluation Criteria

### What We're Demonstrating

| Criterion | How We Demonstrate It |
|-----------|----------------------|
| **Software Architecture** | Clean Architecture + DDD principles, layer separation, testability |
| **Database Design** | Normalized schema, proper relationships, indexes for queries |
| **Security** | JWT auth, refresh token rotation, input validation, SQL injection prevention |
| **Code Quality** | TypeScript strict mode, comprehensive tests, meaningful abstractions |
| **Scalability** | Multi-tenant design, efficient queries, distributed scheduling |
| **DevOps Maturity** | Docker, CI/CD workflows, automated testing, production monitoring |
| **Documentation** | Comprehensive docs for architecture, decisions, API, deployment |
| **Problem-Solving** | Real business problem solved with elegant technical solutions |

### Strengths to Highlight

1. ✅ **Real Clean Architecture** - Not just folder structure, actual layer isolation
2. ✅ **Rich Domain Modeling** - Entities with behavior, invariant protection
3. ✅ **Event-Driven Design** - Transactional Outbox with idempotency
4. ✅ **Type Safety** - TypeScript strict + discriminated unions + Zod validation
5. ✅ **Multi-Tenancy** - Company-level auth, data isolation, scalable design
6. ✅ **Comprehensive Testing** - 266+ tests across unit/integration/e2e
7. ✅ **Production Ready** - Deployed, monitored, scalable infrastructure
8. ✅ **Well Documented** - Every decision explained with rationale

### Areas of Transparency

- **RBAC Not Implemented**: Roles (ADMIN/MANAGER/EMPLOYEE) exist in schema but no route protection yet
  - *Rationale*: Foundational architecture (company-level auth) designed to support RBAC
  - *Roadmap*: RolesGuard can be implemented in next phase
- **Limited Frontend Tests**: Dashboard components have tests, pages/hooks don't
  - *Rationale*: Backend test coverage prioritized (266+ tests)
  - *Roadmap*: Page-level E2E tests with Playwright can follow
- **Auth Module Light on Tests**: Focus was contract/service-day core logic
  - *Rationale*: Auth patterns are well-established; domain innovation is in contracts
  - *Roadmap*: Can be expanded when implementing OAuth2/SAML

---

## Conclusion

**ChefOps** demonstrates production-grade software engineering applied to a real business problem. It's not a tutorial project or proof-of-concept—it's a deployable, testable, maintainable system that could serve actual catering companies.

### What Makes This a Master's-Level Project

1. **Architectural Maturity**: Clean Architecture with actual layer isolation, not just theory
2. **Domain Complexity**: Real state machines (contracts), business rules, event-driven workflows
3. **Technical Depth**: Transactional Outbox, advisory locks, type-safe APIs, multi-tenant design
4. **Engineering Discipline**: Comprehensive testing, documentation, security considerations
5. **Scale Thinking**: Designed to grow to hundreds of tenants and thousands of contracts

### Key Takeaway

This project proves that **quality software requires clear thinking about layers, domains, and tradeoffs**. It's not about using the latest frameworks—it's about using the right patterns to solve real problems elegantly.

---

## Quick Links

- **GitHub Backend**: https://github.com/go-carballo/catering-api
- **GitHub Frontend**: https://github.com/go-carballo/catering-frontend
- **Live Demo**: https://chefops.vercel.app (frontend)
- **API Swagger**: https://catering-api-production.up.railway.app/docs
- **Project Overview**: [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)
- **Architecture Details**: [ARCHITECTURE.md](./ARCHITECTURE.md)

---

<p align="center">
  <sub>Built as a Master's thesis project demonstrating Clean Architecture, DDD, and production-grade engineering</sub>
</p>
