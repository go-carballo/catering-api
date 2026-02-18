# Deployment & Operations
## DevOps, CI/CD, Monitoring, and Production Management

---

## Table of Contents

1. [Deployment Architecture](#deployment-architecture)
2. [Production Environment](#production-environment)
3. [CI/CD Pipeline](#cicd-pipeline)
4. [Database Migrations](#database-migrations)
5. [Scaling & Performance](#scaling--performance)
6. [Monitoring & Alerting](#monitoring--alerting)
7. [Incident Response](#incident-response)
8. [Backup & Disaster Recovery](#backup--disaster-recovery)

---

## Deployment Architecture

### Full Stack Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    GITHUB (Source Control)                  │
└───────────────────────────────────────────────────────────────┘
                ↓ push to main          ↓ push to dev
        ┌───────────────┐        ┌──────────────┐
        │ main branch   │        │ dev branch   │
        │ (production)  │        │ (staging)    │
        └───────┬───────┘        └──────┬───────┘
                ↓                       ↓
        ┌──────────────────┐    ┌──────────────────┐
        │ GitHub Actions   │    │ GitHub Actions   │
        │ Run tests        │    │ Run tests        │
        │ Build Docker img │    │ Build Docker img │
        │ Manual deploy    │    │ Auto deploy      │
        └────────┬─────────┘    └────────┬─────────┘
                 ↓                       ↓
        ┌──────────────────┐    ┌──────────────────┐
        │ Railway Prod     │    │ Railway Staging  │
        │ Backend + DB     │    │ Backend + DB     │
        └────────┬─────────┘    └────────┬─────────┘
                 ↓                       ↓
        ┌──────────────────┐    ┌──────────────────┐
        │ Vercel Prod      │    │ Vercel Preview   │
        │ Frontend         │    │ Frontend         │
        └──────────────────┘    └──────────────────┘
```

### Git Workflow

```
main (production)
  ↑
  ├─ Manual merge from dev (after testing)
  
dev (staging)
  ↑
  ├─ Auto-deployed on merge
  
feature branches
  ├─ feat/users-management
  ├─ feat/contracts-dashboard
  └─ Always merge to dev first
```

---

## Production Environment

### Backend (Railway)

```yaml
Service: catering-api-production
Region: US-East (Pennsylvania)
Plan: Standard ($4/month)

Specs:
  - CPU: Shared
  - Memory: 512MB
  - Disk: 1GB ephemeral

Environment Variables:
  NODE_ENV: production
  DATABASE_URL: (Railway PostgreSQL)
  JWT_SECRET: (strong random)
  FRONTEND_URL: https://chefops.vercel.app
  API_PORT: 3000
```

### Database (Railway Managed PostgreSQL)

```yaml
Service: PostgreSQL 16
Region: US-East
Plan: Paid ($15/month)

Specs:
  - CPU: 1 vCPU
  - Memory: 256MB RAM
  - Storage: 10GB (auto-expandable)
  
Backups:
  - Daily automated
  - 30-day retention
  - Point-in-time recovery available
```

### Frontend (Vercel)

```yaml
Project: chefops
Domain: https://chefops.vercel.app
Plan: Hobby (free tier)

Deployment:
  - Auto-deploy on git push to main
  - Preview deployments for PRs
  - Edge functions: included
  - Analytics: included
```

### DNS & CDN

```
chefops.vercel.app
  ↓ (Vercel nameservers)
  ├─ Frontend: Vercel CDN (global)
  └─ Points to GitHub repo
  
catering-api-production.up.railway.app
  ↓ (Railway infrastructure)
  └─ Backend: Direct API endpoint
```

---

## CI/CD Pipeline

### GitHub Actions Workflows

#### 1. Test on Every Push (PR)

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
    
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 22
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm run lint
      - run: pnpm run typecheck
      - run: pnpm run test:all
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

#### 2. Build Docker Image

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    branches: [main, dev]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Docker image
        run: docker build -t catering-api:${{ github.sha }} .
      
      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      
      - name: Push image
        run: |
          docker tag catering-api:${{ github.sha }} \
            ghcr.io/go-carballo/catering-api:latest
          docker push ghcr.io/go-carballo/catering-api:latest
```

#### 3. Deploy to Staging (Auto)

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy Staging

on:
  push:
    branches: [dev]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Railway Staging
        run: |
          npx railway deploy --environment staging
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

#### 4. Deploy to Production (Manual)

```yaml
# .github/workflows/deploy-prod.yml
name: Deploy Production

on:
  workflow_dispatch:  # Manual trigger only

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Verify on main branch
        run: |
          if [ "${{ github.ref }}" != "refs/heads/main" ]; then
            echo "Can only deploy from main branch"
            exit 1
          fi
      
      - name: Deploy to Railway Production
        run: |
          npx railway deploy --environment production
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN_PROD }}
      
      - name: Verify deployment
        run: |
          curl https://catering-api-production.up.railway.app/api/health
```

---

## Database Migrations

### Schema Versioning

```
drizzle/
├── 0001_init_schema.sql
├── 0002_add_user_roles.sql
├── 0003_add_outbox_events.sql
└── meta/
    └── _journal.json
```

### Migration Workflow

```bash
# 1. Make schema changes in Drizzle
src/db/schema.ts:
  export const companies = pgTable('companies', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email').unique().notNull(),
    // NEW COLUMN
    phone: varchar('phone'),
  });

# 2. Generate migration SQL
pnpm run migrate:generate
# Creates: drizzle/0004_add_phone.sql

# 3. Dev: Run locally
pnpm run migrate
# Test on local PostgreSQL

# 4. Push to GitHub
git add drizzle/0004_add_phone.sql
git commit -m "chore: add phone column to companies"
git push

# 5. Merge to main
# GitHub Actions runs: pnpm run migrate
# Applies to production database automatically

# 6. Verify in production
npx drizzle-kit studio
```

### Zero-Downtime Migrations

**Safe** (can run without downtime):
```sql
ALTER TABLE companies ADD COLUMN phone VARCHAR(20) NULL;
-- Nullable columns don't require existing data
```

**Risky** (requires deployment coordination):
```sql
ALTER TABLE companies ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
-- Must:
-- 1. Deploy code that knows about this column
-- 2. Then add non-nullable column
-- 3. Can't add non-nullable without default
```

**How we handle it**:
1. Always use `NULL` or `DEFAULT` values
2. Deploy code change first
3. Then add column
4. No downtime

---

## Scaling & Performance

### Current Scale

| Metric | Current | Limit |
|--------|---------|-------|
| **Companies** | ~10 | 1,000+ (no scaling needed) |
| **Contracts** | ~50 | 10,000+ (no scaling needed) |
| **Service Days** | ~10,000 | 1M+ (horizontal scaling needed) |
| **Req/sec** | ~10 | 100+ (load balancing) |
| **DB Connections** | ~5 | 50+ (connection pool) |

### Optimization Layers

#### 1. Database Level

```sql
-- Indexes on hot paths
CREATE INDEX idx_service_days_contract_date 
  ON service_days(contract_id, service_date DESC);

-- Efficient queries
SELECT * FROM service_days
WHERE contract_id = $1
  AND service_date BETWEEN $2 AND $3
ORDER BY service_date DESC;
-- Uses index, returns in milliseconds
```

#### 2. Application Level

```typescript
// Caching with TanStack Query (frontend)
const contractKeys = {
  detail: (id: string) => [id],
};

useQuery({
  queryKey: contractKeys.detail(id),
  queryFn: () => getContract(id),
  staleTime: 5 * 60 * 1000,  // 5 minutes
});
// Subsequent requests use cache

// Pagination (backend)
GET /api/contracts?page=1&limit=20
// Don't load all 10,000 contracts
```

#### 3. Horizontal Scaling

**When needed** (scale to 100+ req/sec):

```yaml
# Multiple app instances
Railway:
  Instances: 3
  CPU: 1 vCPU each
  Total: 3 vCPU handling load

Load Balancer:
  Railway handles automatically
  Distributes requests across instances

Database:
  PostgreSQL connection pool: 50 max
  Each instance gets 16 connections
  Total: 48 of 50 available
```

**How it works**:
```
User Request
  ↓
Railway Load Balancer
  ├─ Instance 1 (10% load)
  ├─ Instance 2 (10% load)
  └─ Instance 3 (10% load)
  
All instances share same database
All instances publish to same event bus
```

---

## Monitoring & Alerting

### Application Health

```bash
# Health check endpoint
GET https://catering-api-production.up.railway.app/api/health

Response:
{
  "status": "ok",
  "timestamp": "2026-02-18T15:30:00Z",
  "database": "connected",
  "uptime": 86400
}
```

### Monitoring Tools

#### 1. Railway Dashboard

```
catering-api-production
├─ Metrics
│  ├─ CPU: 15%
│  ├─ Memory: 128MB / 512MB
│  ├─ Network: 10 KB/s in, 50 KB/s out
│  └─ Uptime: 99.9%
├─ Logs
│  ├─ Last 100 lines (searchable)
│  └─ Errors highlighted
└─ Events
   ├─ Deployment history
   └─ Restarts
```

#### 2. Vercel Analytics (Frontend)

```
chefops.vercel.app
├─ Core Web Vitals
│  ├─ Largest Contentful Paint (LCP)
│  ├─ First Input Delay (FID)
│  └─ Cumulative Layout Shift (CLS)
├─ Page views
├─ Top pages
└─ Real User Monitoring (RUM)
```

#### 3. PostgreSQL Monitoring

```sql
-- Check slow queries
SELECT query, calls, mean_time 
FROM pg_stat_statements 
WHERE mean_time > 100 
ORDER BY mean_time DESC 
LIMIT 10;

-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables 
WHERE schemaname NOT IN ('pg_catalog', 'information_schema') 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check connections
SELECT datname, usename, count(*) 
FROM pg_stat_activity 
GROUP BY datname, usename;
```

### Logging Strategy

```typescript
// Log levels (in order of severity)
logger.error('Critical failure');      // Errors that need immediate attention
logger.warn('Deprecation warning');    // Warnings, but app continues
logger.info('Server started');         // Important events
logger.debug('User login attempt');    // Detailed info for debugging

// Production logs:
// - Error & Warn → Always captured
// - Info → Sample 10% (reduce noise)
// - Debug → Disabled (too verbose)
```

---

## Incident Response

### When Something Breaks

#### 1. Immediate (P1 - Critical)

```bash
# Database down
1. Check Railway Dashboard → Status
2. If crashed: auto-restart by Railway (usually recovers in 30s)
3. If not: rollback last migration
   git revert <bad-migration-commit>
   pnpm run migrate
4. If still broken: restore from backup
   Railway → Postgres → Backups → Restore

# API down
1. Check logs in Railway
2. Look for error patterns
3. If recent deployment: rollback
   git revert <commit>
   git push (auto-deploys)
4. If not deployment: check database connection
```

#### 2. Investigation (P2 - Major)

```bash
# Slow API response
1. Check slow query log
   SELECT query, mean_time FROM pg_stat_statements 
   WHERE mean_time > 1000;

2. Add index if needed
   CREATE INDEX idx_...;

3. Check app logs for exceptions
   Railway → Logs → filter by ERROR

4. If issue persists: scale up
   Railway → Update plan
```

#### 3. Prevention

- Monitor error rates (alert if > 1% 5xx errors)
- Monitor latency (alert if p95 > 1 second)
- Monitor database size (alert if > 80% of quota)
- Monitor disk space (alert if < 20% free)

---

## Backup & Disaster Recovery

### Backup Strategy

```yaml
Database Backups:
  Frequency: Daily automated
  Retention: 30 days
  Type: Full backup + WAL (write-ahead log)
  Storage: Railway managed (redundant)
  RTO: < 30 seconds (failover)
  RPO: < 1 minute (all changes captured)
```

### Recovery Procedures

#### Full Database Restore (Point-in-Time)

```bash
# 1. Go to Railway Dashboard
# 2. PostgreSQL service → Backups tab
# 3. Select timestamp to restore
# 4. Click "Restore"
# 5. Database restarts with old data (automatic)

# Expected downtime: 2-5 minutes
# App shows 503 Service Unavailable during restore
```

#### Partial Restore (Single Table)

```sql
-- If only one table corrupted, restore that table
-- 1. Export backup to SQL
pg_dump -t companies production.db > backup.sql

-- 2. Import into test DB
psql test_db < backup.sql

-- 3. Verify data is correct
SELECT * FROM companies LIMIT 1;

-- 4. Replace production table
DELETE FROM companies WHERE deleted_at IS NOT NULL;
-- Soft-deleted rows remain

INSERT INTO companies (id, email, name, ...)
SELECT id, email, name, ... FROM backup_companies
WHERE id NOT IN (SELECT id FROM companies);
```

### Data Retention Policy

```
Active data: Keep indefinitely
Soft-deleted data (deleted_at IS NOT NULL):
  - Keep for 30 days (allow undelete)
  - Archive to cold storage after 30 days
  - Hard delete after 1 year (compliance)

Outbox events (processed):
  - Keep for 30 days (audit trail)
  - Archive to logs after 30 days

Refresh tokens (revoked):
  - Delete immediately after revoked
  - (no need to keep)
```

---

## Deployment Checklist

### Before Merging to Main

- [ ] All tests passing
- [ ] Code review approved
- [ ] No security issues (dependency audit)
- [ ] No breaking database changes

### Before Deploying to Production

- [ ] Staging tested and working
- [ ] Team notified of deployment
- [ ] Backup created (automatic)
- [ ] Rollback plan ready

### After Deployment

- [ ] Health check passes
- [ ] Error rate normal (< 0.5%)
- [ ] Response time normal (p95 < 1s)
- [ ] Database health good
- [ ] Team confirmed working

---

<p align="center">
  <sub>Deployment & Operations for ChefOps - CI/CD, Monitoring, and Disaster Recovery</sub>
</p>
