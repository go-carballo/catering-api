<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS 11"/>
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL 16"/>
  <img src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black" alt="Drizzle ORM"/>
  <img src="https://img.shields.io/badge/Tests-134%20passing-brightgreen?style=for-the-badge" alt="Tests"/>
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License"/>
</p>

# 🍽️ Catering API

**Multi-tenant REST API for catering contract management**  
Handle contract lifecycle, service day scheduling, and reporting between catering companies and their clients.

[Quick Start](#-quick-start) • [API Endpoints](#-api-endpoints) • [Development](#-development) • [Testing](#-testing) • [Architecture](#-architecture)

---

## ✨ Features

| Feature                       | Description                                          |
| ----------------------------- | ---------------------------------------------------- |
| 🔐 **Authentication**         | JWT-based auth with bcrypt password hashing          |
| 📝 **Contract Management**    | Create, pause, resume, and terminate contracts       |
| 📅 **Service Day Scheduling** | Automated generation based on contract terms         |
| 📊 **Reporting**              | Weekly reports with cost calculations and CSV export |
| 🏢 **Multi-tenant**           | Support for CATERING and CLIENT company types        |
| ⚡ **Domain Events**          | Transactional outbox pattern for guaranteed delivery |

---

## 🚀 Quick Start

```bash
# One command to rule them all
make up
```

This will:

1. 🐳 Build the Docker image
2. 🐘 Start PostgreSQL database
3. 🚀 Start the API in production mode

Once running:
| Service | URL |
|---------|-----|
| **API** | http://localhost:3000 |
| **Swagger Docs** | http://localhost:3000/api |
| **Database** | localhost:5434 |

---

## 📋 API Endpoints

### 🔐 Authentication

```http
POST /auth/login    # Login with email/password
```

### 📝 Contracts

```http
GET    /contracts                    # List all contracts
GET    /contracts/:id                # Get contract by ID
POST   /contracts                    # Create new contract
POST   /contracts/:id/pause          # Pause active contract
POST   /contracts/:id/resume         # Resume paused contract
POST   /contracts/:id/terminate      # Terminate contract
```

### 📅 Service Days

```http
GET    /contracts/:id/service-days           # Get service days (with date range)
POST   /contracts/:id/service-days/generate  # Generate service days
POST   /service-days/:id/confirm-expected    # Client confirms expected quantity
POST   /service-days/:id/confirm-served      # Catering confirms served quantity
```

### 📊 Reports

```http
GET    /contracts/:id/reports/weekly         # Get weekly report (JSON)
GET    /contracts/:id/reports/weekly/csv     # Export weekly report (CSV)
```

---

## 🛠️ Development

### Prerequisites

- Node.js 22+
- pnpm
- Docker & Docker Compose

### Setup

```bash
# Full development setup (install deps, start DB, migrate, seed)
make dev-setup

# Start development server with hot reload
make dev
```

### Manual Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment file
cp .env.example .env

# 3. Start database
make db-up

# 4. Run migrations
make migrate

# 5. Seed database
make seed

# 6. Start development server
pnpm start:dev
```

### Environment Variables

| Variable       | Description                  | Default                                                   |
| -------------- | ---------------------------- | --------------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5434/catering_db` |
| `JWT_SECRET`   | Secret key for JWT tokens    | -                                                         |
| `PORT`         | Server port                  | `3000`                                                    |
| `NODE_ENV`     | Environment mode             | `development`                                             |

---

## 🧪 Testing

```bash
make test              # Run unit tests
make test-watch        # Run tests in watch mode
make test-cov          # Run tests with coverage
make test-integration  # Run integration tests
```

### Test Credentials (Seed Data)

| Company           | Email                | Password    | Type     |
| ----------------- | -------------------- | ----------- | -------- |
| Delicias Catering | delicias@example.com | password123 | CATERING |
| TechCorp          | techcorp@example.com | password123 | CLIENT   |

---

## 🏗️ Architecture

### Clean Architecture with Modular Structure

```
src/
├── modules/
│   └── <feature>/
│       ├── domain/           # Entities, value objects, domain errors
│       ├── application/      # Services, DTOs, use cases
│       └── infrastructure/   # Controllers, repositories
├── shared/
│   ├── domain/              # Shared domain errors, ports
│   ├── events/              # Event bus, domain events
│   ├── outbox/              # Transactional outbox pattern
│   ├── guards/              # Auth guards
│   └── infrastructure/      # Database, system services
```

### Key Patterns

| Pattern                    | Description                                     |
| -------------------------- | ----------------------------------------------- |
| **Rich Domain Entities**   | Entities with behavior, not just data           |
| **Domain Errors**          | Typed errors extending `DomainError` base class |
| **Transactional Outbox**   | Guaranteed event delivery within transactions   |
| **Data/Entity Separation** | `*Data` interfaces + `*Entity` classes          |

### Contract State Machine

```
ACTIVE <──> PAUSED ──> TERMINATED
   │                        ▲
   └────────────────────────┘
```

- Only ACTIVE contracts can be paused
- Only PAUSED contracts can be resumed
- Both ACTIVE and PAUSED can be terminated
- TERMINATED is a final state

---

## 📦 Make Commands

```bash
make help              # Show all available commands

# 🚀 One-command setup
make up                # Start everything (DB + API in production)
make down              # Stop all services
make logs              # Show API logs
make status            # Show service status

# 💻 Development
make dev               # Start dev server with hot reload
make dev-setup         # Full development setup

# 🐘 Database
make db-up             # Start PostgreSQL
make db-down           # Stop PostgreSQL
make db-reset          # Reset database (delete all data)
make db-shell          # Open psql shell

# 🔄 Migrations
make migrate           # Run migrations (push schema)
make migrate-generate  # Generate migration from schema changes
make migrate-studio    # Open Drizzle Studio (DB GUI)

# 🌱 Seeding
make seed              # Seed database with sample data

# 🧪 Testing
make test              # Run unit tests
make test-watch        # Run tests in watch mode
make test-cov          # Run tests with coverage
make test-integration  # Run integration tests

# 🏗️ Build
make build             # Build for production
make build-docker      # Build Docker image

# 🛠️ Tools
make pgadmin           # Start pgAdmin UI (http://localhost:5050)
make lint              # Run linter
make format            # Format code
make clean             # Clean up everything
```

---

## 📚 Business Rules

### Service Day Confirmation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Service Day Lifecycle                         │
├─────────────────────────────────────────────────────────────────┤
│  1. Service day generated (from contract schedule)              │
│     └─► expectedQuantity = contract.defaultQuantity             │
│                                                                  │
│  2. CLIENT confirms expected quantity                           │
│     └─► Must respect notice period (e.g., 24h before)           │
│     └─► Must be within min/max range                            │
│                                                                  │
│  3. CATERING confirms served quantity (after service)           │
│     └─► Final quantity delivered                                │
│                                                                  │
│  4. Once confirmed → Immutable                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🐳 Docker Compose Profiles

| Profile     | Description                                   |
| ----------- | --------------------------------------------- |
| **default** | Just PostgreSQL (for development)             |
| **prod**    | PostgreSQL + API container                    |
| **tools**   | pgAdmin for database management               |
| **test**    | Isolated test database (uses tmpfs for speed) |

```bash
# Start production stack
docker compose --profile prod up -d

# Start with pgAdmin
make pgadmin

# Run integration tests
make test-integration
```

---

## 📄 License

MIT

---

<p align="center">
  Made with ☕ and Clean Architecture
</p>
