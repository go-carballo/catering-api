.PHONY: help db-up db-down db-logs db-reset migrate migrate-generate seed dev test build

# Colors
GREEN  := \033[0;32m
YELLOW := \033[0;33m
CYAN   := \033[0;36m
RED    := \033[0;31m
RESET  := \033[0m

help: ## Show this help
	@echo "$(CYAN)Catering API - Available commands:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'

# ============ ONE COMMAND SETUP ============

up: ## [ONE COMMAND] Start everything (DB + API in production mode)
	@echo "$(CYAN)Starting Catering API...$(RESET)"
	docker compose --profile prod up -d
	@echo ""
	@echo "$(GREEN)Waiting for services to be ready...$(RESET)"
	@sleep 5
	@echo ""
	@echo "$(GREEN)╔══════════════════════════════════════════════════════╗$(RESET)"
	@echo "$(GREEN)║  Catering API is running!                            ║$(RESET)"
	@echo "$(GREEN)╠══════════════════════════════════════════════════════╣$(RESET)"
	@echo "$(GREEN)║  API:      http://localhost:3000                     ║$(RESET)"
	@echo "$(GREEN)║  Swagger:  http://localhost:3000/api                 ║$(RESET)"
	@echo "$(GREEN)║  Database: localhost:5434                            ║$(RESET)"
	@echo "$(GREEN)╚══════════════════════════════════════════════════════╝$(RESET)"
	@echo ""
	@echo "$(YELLOW)Run 'make logs' to see API logs$(RESET)"
	@echo "$(YELLOW)Run 'make down' to stop all services$(RESET)"

down: ## Stop all services
	docker compose --profile prod --profile tools --profile test down

logs: ## Show API logs
	docker compose logs -f api

status: ## Show status of all services
	docker compose ps -a

# ============ DEVELOPMENT ============

dev: db-up ## Start development server with hot reload
	@echo "$(CYAN)Starting development server...$(RESET)"
	pnpm run start:dev

dev-setup: ## Setup development environment (install deps + db + migrate + seed)
	@echo "$(CYAN)Setting up development environment...$(RESET)"
	pnpm install
	$(MAKE) db-up
	@sleep 3
	$(MAKE) migrate
	$(MAKE) seed
	@echo ""
	@echo "$(GREEN)Development environment ready!$(RESET)"
	@echo "$(YELLOW)Run 'make dev' to start the server$(RESET)"

# ============ DATABASE ============

db-up: ## Start PostgreSQL container
	docker compose up -d postgres
	@echo "$(GREEN)Waiting for PostgreSQL to be ready...$(RESET)"
	@sleep 2
	@echo "$(GREEN)PostgreSQL is running on localhost:5434$(RESET)"

db-down: ## Stop PostgreSQL container
	docker compose down postgres

db-logs: ## Show PostgreSQL logs
	docker compose logs -f postgres

db-reset: ## Reset database (delete all data)
	docker compose down -v postgres
	$(MAKE) db-up
	@sleep 3
	$(MAKE) migrate

db-shell: ## Open psql shell
	docker compose exec postgres psql -U postgres -d catering_db

# ============ MIGRATIONS ============

migrate: ## Run database migrations (push schema)
	pnpm drizzle-kit push

migrate-generate: ## Generate new migration from schema changes
	pnpm drizzle-kit generate

migrate-studio: ## Open Drizzle Studio (database GUI)
	pnpm drizzle-kit studio

# ============ SEEDING ============

seed: ## Seed database with sample data
	pnpm db:seed

# ============ TESTING ============

test: ## Run unit tests
	pnpm test

test-watch: ## Run unit tests in watch mode
	pnpm test:watch

test-cov: ## Run tests with coverage
	pnpm test:cov

test-integration: ## Run integration tests (requires test DB)
	@echo "$(CYAN)Starting test database...$(RESET)"
	docker compose --profile test up -d postgres-test
	@sleep 3
	@echo "$(CYAN)Running integration tests...$(RESET)"
	pnpm vitest run --config vitest.integration.config.ts || true
	@echo "$(CYAN)Stopping test database...$(RESET)"
	docker compose --profile test down

# ============ BUILD ============

build: ## Build for production
	pnpm build

build-docker: ## Build Docker image
	docker compose build api

# ============ TOOLS ============

pgadmin: ## Start pgAdmin UI (http://localhost:5050)
	docker compose --profile tools up -d pgadmin
	@echo "$(GREEN)pgAdmin is running on http://localhost:5050$(RESET)"
	@echo "$(YELLOW)Email: admin@catering.local | Password: admin$(RESET)"

lint: ## Run linter
	pnpm lint

format: ## Format code
	pnpm format

# ============ UTILITIES ============

clean: ## Clean up containers, volumes, and build artifacts
	docker compose --profile prod --profile tools --profile test down -v
	rm -rf dist node_modules

install: ## Install dependencies
	pnpm install
