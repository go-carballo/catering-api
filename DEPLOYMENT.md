# 🚀 Deployment Guide

**Catering API** - Production deployment instructions for Railway, Docker, and traditional VPS.

> **Status**: Ready for production. All 266 tests passing. Health check endpoint available.

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Railway Deployment](#railway-deployment)
3. [Docker Deployment](#docker-deployment)
4. [Environment Variables](#environment-variables)
5. [Database Migrations](#database-migrations)
6. [Health Monitoring](#health-monitoring)
7. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

Before deploying to production, verify:

- [ ] All tests passing: `pnpm test` (266+ tests)
- [ ] Build successful: `pnpm run build`
- [ ] No console.log in production code: `rg 'console\.(log|warn|error)' src --exclude '\.spec\.ts'`
- [ ] No TODO/FIXME remaining: `rg 'TODO|FIXME' src --exclude '\.spec\.ts'`
- [ ] JWT_SECRET set in environment
- [ ] DATABASE_URL points to production database
- [ ] NODE_ENV=production
- [ ] Database migrations applied
- [ ] Health endpoint responds: `GET /api/health`
- [ ] Seed endpoint is protected (requires JWT): `POST /api/seed` returns 401

### Quick Pre-Deploy Script

```bash
#!/bin/bash
set -e

echo "🧪 Running tests..."
pnpm test

echo "🏗️  Building..."
pnpm run build

echo "🔍 Checking for console.log in production code..."
rg 'console\.(log|warn|error)' src --exclude '\.spec\.ts' && echo "❌ Found console.log" && exit 1 || echo "✅ No console.log found"

echo "🔍 Checking for TODO/FIXME..."
rg 'TODO|FIXME' src --exclude '\.spec\.ts' && echo "❌ Found TODO/FIXME" && exit 1 || echo "✅ No TODO/FIXME found"

echo "✅ All checks passed! Ready to deploy."
```

---

## Railway Deployment

### Step 1: Create Railway Project

```bash
# Login to Railway
railway login

# Create new project
railway init
```

### Step 2: Set Up PostgreSQL

```bash
# Add PostgreSQL plugin
railway add

# Select PostgreSQL 16
```

This automatically creates `DATABASE_URL` environment variable.

### Step 3: Configure Environment Variables

In Railway dashboard, add:

```env
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
PORT=3000
```

### Step 4: Deploy

```bash
# Deploy from local repo
railway up

# Or connect GitHub for automatic deployments
# (Railway dashboard → GitHub integration)
```

### Step 5: Verify Deployment

```bash
# Get deployed URL from Railway dashboard
DEPLOYED_URL="https://your-app.railway.app"

# Test health check
curl $DEPLOYED_URL/api/health

# Expected response:
# {"status":"ok","timestamp":"...","database":"connected"}
```

### Production URL Structure

Once deployed on Railway:

- **API Base**: `https://your-app.railway.app/api`
- **Swagger Docs**: `https://your-app.railway.app/docs`
- **Health Check**: `https://your-app.railway.app/api/health`

---

## Docker Deployment

### Build Docker Image

```bash
# Build production image
docker build -t catering-api:latest .

# Tag for registry (e.g., Docker Hub)
docker tag catering-api:latest your-registry/catering-api:latest
```

### Docker Compose (Production Profile)

```bash
# Start full stack (PostgreSQL + API)
docker compose --profile prod up -d

# View logs
docker compose logs -f api

# Stop
docker compose --profile prod down
```

### Environment Variables in Docker

Create `.env.production`:

```env
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key
DATABASE_URL=postgresql://postgres:postgres@db:5432/catering_db
PORT=3000
```

### Kubernetes Deployment (Optional)

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: catering

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: catering-api
  namespace: catering
spec:
  replicas: 2
  selector:
    matchLabels:
      app: catering-api
  template:
    metadata:
      labels:
        app: catering-api
    spec:
      containers:
        - name: api
          image: your-registry/catering-api:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: 'production'
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: catering-secrets
                  key: jwt-secret
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: catering-secrets
                  key: database-url
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
          resources:
            requests:
              memory: '256Mi'
              cpu: '100m'
            limits:
              memory: '512Mi'
              cpu: '500m'

---
apiVersion: v1
kind: Service
metadata:
  name: catering-api
  namespace: catering
spec:
  selector:
    app: catering-api
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: LoadBalancer
```

---

## Environment Variables

### Required (Must Set in Production)

| Variable       | Description                   | Example                                          |
| -------------- | ----------------------------- | ------------------------------------------------ |
| `JWT_SECRET`   | Secret for signing JWT tokens | `super-secret-key-min-32-chars-long-recommended` |
| `DATABASE_URL` | PostgreSQL connection string  | `postgresql://user:pass@host:5432/catering_db`   |
| `NODE_ENV`     | Environment mode              | `production`                                     |

### Optional (Has Defaults)

| Variable    | Description        | Default                       |
| ----------- | ------------------ | ----------------------------- |
| `PORT`      | Server listen port | `3000`                        |
| `LOG_LEVEL` | Logging level      | `info` (development: `debug`) |

### Security Notes

- **JWT_SECRET**: Must be at least 32 characters. Use strong random string.
  ```bash
  # Generate secure JWT_SECRET
  openssl rand -base64 32
  ```
- **DATABASE_URL**: Never commit to version control. Use secrets management.
- **NODE_ENV**: Always `production` for deployed instances.

---

## Database Migrations

### Automatic Migrations on Startup

The application automatically runs pending migrations on startup via Drizzle ORM.

### Manual Migration

```bash
# Push schema to database
pnpm run migrate

# Generate migration from schema changes
pnpm run migrate:generate
```

### Migration History

All migrations are tracked in `drizzle/migrations/` directory. Each file has a timestamp and descriptive name.

```
drizzle/migrations/
├── 0001_init_schema.sql
├── 0002_add_outbox_table.sql
└── ...
```

### Rollback Strategy

> ⚠️ **Note**: Drizzle ORM does not support automatic rollbacks. For critical production data:

1. Always test migrations in staging first
2. Keep database backups before deployment
3. For rollback, restore from backup and redeploy previous version

---

## Health Monitoring

### Health Check Endpoint

The API provides a public health check endpoint (no authentication required):

```http
GET /api/health
```

**Response (Success)**:

```json
{
  "status": "ok",
  "timestamp": "2026-02-05T20:39:25.804Z",
  "database": "connected"
}
```

**Response (Failure)**:

```json
{
  "status": "error",
  "timestamp": "2026-02-05T20:39:25.804Z",
  "database": "disconnected",
  "error": "Connection timeout"
}
```

### Monitoring Integration

**Kubernetes**:

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
```

**Railway Healthcheck**:

```yaml
# In railway.json
{ 'healthchecks': { 'path': '/api/health', 'interval': 10 } }
```

**Monitoring Tools**:

- Datadog: `https://app.datadoghq.com/monitors` → HTTP Check
- New Relic: Synthetic monitoring → New HTTP monitor
- Prometheus: Scrape `/api/health` endpoint

### Logging

The application uses NestJS Logger for all logs:

```bash
# View production logs (Docker)
docker compose logs -f api

# View production logs (Railway)
railway logs

# View production logs (Kubernetes)
kubectl logs -f deployment/catering-api -n catering
```

---

## Troubleshooting

### Issue: `Unauthorized` when accessing protected endpoints

**Cause**: JWT token missing or invalid.

**Solution**:

1. Login to get token: `POST /api/auth/login`
2. Include token in requests: `Authorization: Bearer <token>`

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "delicias@example.com",
    "password": "password123"
  }'

# Response includes accessToken
# Use in subsequent requests:
curl http://localhost:3000/api/contracts \
  -H "Authorization: Bearer <accessToken>"
```

### Issue: `Health check returns {"status":"error","database":"disconnected"}`

**Cause**: Database connection failed.

**Solution**:

1. Verify DATABASE_URL is correct
2. Check database is running: `docker compose logs db`
3. Check network connectivity to database
4. Review database logs for errors

```bash
# Test database connection
psql $DATABASE_URL -c "SELECT 1"

# If psql not installed, use Docker:
docker exec catering-api-db psql -U postgres -c "SELECT 1"
```

### Issue: Migrations failed on startup

**Cause**: Schema mismatch or missing migrations.

**Solution**:

1. Check migration files exist: `ls drizzle/migrations/`
2. Verify database has `__drizzle_migrations__` table
3. Review startup logs: `docker compose logs api` or `railway logs`
4. If needed, reset database (data loss):
   ```bash
   docker compose down -v
   docker compose up
   ```

### Issue: Seed endpoint returns 401 (in development)

**This is expected behavior**. The seed endpoint is now protected by JWT.

**Solution** (if you need to seed):

1. Login first: `POST /api/auth/login`
2. Get accessToken from response
3. Call seed with token:
   ```bash
   curl -X POST http://localhost:3000/api/seed \
     -H "Authorization: Bearer <accessToken>"
   ```

> **Note**: Remove this protection if you want public seeding (not recommended for production).

### Issue: High memory usage in Docker

**Cause**: Node.js memory leak or insufficient limits.

**Solution**:

1. Check logs: `docker compose logs api | grep -i memory`
2. Increase memory limit in Docker Compose:
   ```yaml
   api:
     image: catering-api
     mem_limit: 1g # Increase from default
   ```
3. Restart container: `docker compose restart api`

---

## Performance Optimization (Optional)

### Database Connection Pooling

For high-traffic deployments, consider using PgBouncer:

```yaml
# docker-compose.yml
pgbouncer:
  image: pgbouncer:latest
  environment:
    DATABASES_HOST: db
    DATABASES_PORT: 5432
    DATABASES_USER: postgres
    DATABASES_PASSWORD: postgres
    DATABASES_DBNAME: catering_db
    PGBOUNCER_POOL_MODE: transaction
    PGBOUNCER_MAX_CLIENT_CONN: 1000
    PGBOUNCER_DEFAULT_POOL_SIZE: 25
```

Update DATABASE_URL to point to pgbouncer:

```env
DATABASE_URL=postgresql://postgres:postgres@pgbouncer:6432/catering_db
```

### Caching (Optional)

Add Redis for caching (not currently implemented):

```bash
docker compose up -d redis
```

---

## Rollout Strategy

### Blue-Green Deployment

For zero-downtime deployments:

1. Deploy new version to "green" environment
2. Run health checks and integration tests
3. Switch load balancer to point to "green"
4. Keep "blue" running until verified stable (1 hour minimum)

### Canary Deployment

Gradually roll out to small percentage of traffic:

```yaml
# Kubernetes example
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: catering-api
spec:
  hosts:
    - catering-api
  http:
    - match:
        - uri:
            prefix: /
      route:
        - destination:
            host: catering-api-v1
          weight: 90
        - destination:
            host: catering-api-v2
          weight: 10
```

---

## Emergency Procedures

### Kill Switch (Disable All Requests)

If critical bug discovered, temporarily disable API:

```bash
# Remove from load balancer / set weight to 0
# Keep database running (don't shut down)
# Deploy fix and re-enable
```

### Database Backup & Recovery

```bash
# Backup (run regularly, e.g., daily)
docker exec catering-api-db pg_dump -U postgres catering_db > backup.sql

# Restore
docker exec -i catering-api-db psql -U postgres catering_db < backup.sql
```

### Rollback to Previous Version

```bash
# If deployed on Railway
railway down  # Stop current version
git checkout previous-version
railway up    # Deploy previous version

# If deployed with Docker
docker pull your-registry/catering-api:previous-tag
docker compose up -d  # Uses COMPOSE_IMAGE_TAG environment variable
```

---

## Support & Monitoring

### Alerting Rules

Set up alerts for:

- Health check fails: Trigger within 30 seconds
- Database unavailable: Immediate alert
- Response time > 5 seconds: Monitor 5-minute average
- Error rate > 5%: Immediate alert

### Dashboard

Create monitoring dashboard with:

- Request rate (requests/sec)
- Response time (p50, p95, p99)
- Error rate (5xx errors)
- Database connection pool status
- Memory and CPU usage

---

## Sign-Off

Production deployment checklist:

- [ ] All tests passing on CI/CD
- [ ] Health check endpoint tested
- [ ] Database backups configured
- [ ] Monitoring and alerting set up
- [ ] Team notified of deployment time
- [ ] Rollback plan documented
- [ ] Health check verified post-deployment

**Deployment ready!** ✅

---

<p align="center">
Made with ☕ and Clean Architecture
</p>
