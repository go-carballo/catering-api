<# Catering API

A NestJS-based REST API for managing catering contracts between catering companies and their clients. The system handles contract lifecycle management, service day scheduling, and reporting.

## Features

- **Authentication**: JWT-based authentication with bcrypt password hashing
- **Contract Management**: Create, pause, resume, and terminate contracts
- **Service Day Scheduling**: Automated generation of service days based on contract terms
- **Reporting**: Weekly reports with cost calculations and CSV export
- **Multi-tenant**: Support for both CATERING and CLIENT company types

## Tech Stack

- **Framework**: NestJS 11
- **Database**: PostgreSQL 16 with Drizzle ORM
- **Authentication**: JWT (Passport)
- **Testing**: Vitest (134 unit tests)
- **Package Manager**: pnpm
- **Containerization**: Docker & Docker Compose

## Quick Start (One Command)

```bash
# Clone and start everything
make up
```

This single command will:

1. Build the Docker image
2. Start PostgreSQL database
3. Start the API in production mode

Once running:

- **API**: http://localhost:3000
- **Swagger Docs**: http://localhost:3000/api
- **Database**: localhost:5434

## Development Setup

### Prerequisites

- Node.js 22+
- pnpm
- Docker & Docker Compose

### Setup

```bash
# Install dependencies, start DB, run migrations, and seed data
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

## Environment Variables

| Variable       | Description                  | Default                                                   |
| -------------- | ---------------------------- | --------------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5434/catering_db` |
| `JWT_SECRET`   | Secret key for JWT tokens    | -                                                         |
| `PORT`         | Server port                  | `3000`                                                    |
| `NODE_ENV`     | Environment mode             | `development`                                             |

## API Endpoints

### Authentication

| Method | Endpoint      | Description               |
| ------ | ------------- | ------------------------- |
| POST   | `/auth/login` | Login with email/password |

### Contracts

| Method | Endpoint                   | Description            |
| ------ | -------------------------- | ---------------------- |
| GET    | `/contracts`               | List all contracts     |
| GET    | `/contracts/:id`           | Get contract by ID     |
| POST   | `/contracts`               | Create new contract    |
| POST   | `/contracts/:id/pause`     | Pause active contract  |
| POST   | `/contracts/:id/resume`    | Resume paused contract |
| POST   | `/contracts/:id/terminate` | Terminate contract     |

### Service Days

| Method | Endpoint                               | Description                        |
| ------ | -------------------------------------- | ---------------------------------- |
| GET    | `/contracts/:id/service-days`          | Get service days (with date range) |
| POST   | `/contracts/:id/service-days/generate` | Generate service days              |
| POST   | `/service-days/:id/confirm-expected`   | Client confirms expected quantity  |
| POST   | `/service-days/:id/confirm-served`     | Catering confirms served quantity  |

### Reports

| Method | Endpoint                            | Description                |
| ------ | ----------------------------------- | -------------------------- |
| GET    | `/contracts/:id/reports/weekly`     | Get weekly report (JSON)   |
| GET    | `/contracts/:id/reports/weekly/csv` | Export weekly report (CSV) |

## Testing

```bash
# Run unit tests
make test
# or
pnpm test

# Run tests in watch mode
make test-watch

# Run tests with coverage
make test-cov

# Run integration tests
make test-integration
```

## Project Structure

```
src/
├── modules/
│   ├── auth/                    # Authentication module
│   │   ├── application/         # Services, DTOs
│   │   └── infrastructure/      # Controllers, JWT strategy
│   │
│   ├── contract/                # Contract management
│   │   ├── domain/              # Entities, business rules
│   │   ├── application/         # Services, DTOs
│   │   └── infrastructure/      # Controllers, repositories
│   │
│   ├── service-day/             # Service day scheduling
│   │   ├── domain/              # Entities, business rules
│   │   ├── application/         # Services, scheduler, DTOs
│   │   └── infrastructure/      # Controllers
│   │
│   ├── catering/                # Catering company module
│   └── client/                  # Client company module
│
├── shared/
│   ├── decorators/              # Custom decorators
│   ├── guards/                  # Auth guards
│   └── infrastructure/
│       └── database/            # Drizzle schema, migrations
│
└── test/
    └── integration/             # Integration tests
```

## Available Make Commands

```bash
make help              # Show all available commands

# One-command setup
make up                # Start everything (DB + API in production)
make down              # Stop all services
make logs              # Show API logs
make status            # Show service status

# Development
make dev               # Start dev server with hot reload
make dev-setup         # Full development setup

# Database
make db-up             # Start PostgreSQL
make db-down           # Stop PostgreSQL
make db-reset          # Reset database (delete all data)
make db-shell          # Open psql shell

# Migrations
make migrate           # Run migrations (push schema)
make migrate-generate  # Generate migration from schema changes
make migrate-studio    # Open Drizzle Studio (DB GUI)

# Seeding
make seed              # Seed database with sample data

# Testing
make test              # Run unit tests
make test-watch        # Run tests in watch mode
make test-cov          # Run tests with coverage
make test-integration  # Run integration tests

# Build
make build             # Build for production
make build-docker      # Build Docker image

# Tools
make pgadmin           # Start pgAdmin UI (http://localhost:5050)
make lint              # Run linter
make format            # Format code
make clean             # Clean up everything
```

## Test Credentials (Seed Data)

After running `make seed`, you can login with:

| Company           | Email                | Password    | Type     |
| ----------------- | -------------------- | ----------- | -------- |
| Delicias Catering | delicias@example.com | password123 | CATERING |
| TechCorp          | techcorp@example.com | password123 | CLIENT   |

## Docker Compose Profiles

- **default**: Just PostgreSQL (for development)
- **prod**: PostgreSQL + API container
- **tools**: pgAdmin for database management
- **test**: Isolated test database (uses tmpfs for speed)

```bash
# Start production stack
docker compose --profile prod up -d

# Start with pgAdmin
make pgadmin

# Run integration tests
make test-integration
```

## Business Rules

### Contract States

```
ACTIVE <-> PAUSED -> TERMINATED
   |                     ^
   +---------------------+
```

- Only ACTIVE contracts can be paused
- Only PAUSED contracts can be resumed
- Both ACTIVE and PAUSED contracts can be terminated
- TERMINATED is a final state

### Service Day Confirmation

1. **Client** confirms expected quantity (before service, respecting notice period)
2. **Catering** confirms served quantity (after service)
3. Once confirmed, quantities are immutable

### Quantity Limits

- Expected quantity must be within contract's `minQuantity` and `maxQuantity`
- Default quantity is used if client doesn't confirm before notice period

## License

MIT
# catering-api
