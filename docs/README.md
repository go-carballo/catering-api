# ChefOps Documentation Index

Welcome to the ChefOps documentation. Start with the Master's Thesis overview and navigate through the docs based on your needs.

---

## 📚 Start Here

### [MASTER_THESIS.md](../MASTER_THESIS.md)
Executive summary of ChefOps as a Master's thesis project. Explains why this is production-grade work, key innovations, and evaluation criteria. **Read this first.**

---

## 🏗️ Architecture & Design

### [ARCHITECTURE.md](../ARCHITECTURE.md)
Deep dive into the system architecture:
- Clean Architecture layers (Domain, Application, Infrastructure)
- Domain-Driven Design principles
- Design patterns (Factory, Strategy, Repository, etc.)
- Event-driven architecture with Transactional Outbox
- Testing architecture (unit, integration, E2E)

### [DESIGN_DECISIONS.md](../DESIGN_DECISIONS.md)
The "why" behind major technical decisions:
- Company-level JWT authentication (vs. user-level)
- Transactional Outbox pattern for event reliability
- PostgreSQL Advisory Locks for distributed scheduling
- Result types instead of exceptions
- API design choices (REST endpoints, response formats)
- Multi-tenancy approach

### [DATABASE_DESIGN.md](../DATABASE_DESIGN.md)
Complete data model documentation:
- Entity-Relationship diagrams
- Schema definition with constraints
- Indexes and optimization strategies
- Multi-tenancy isolation
- Migration strategy (Drizzle ORM)

---

## 🔌 API & Integration

### [API_DOCUMENTATION.md](../API_DOCUMENTATION.md)
Complete REST API reference:
- All endpoints documented with request/response examples
- Error codes and handling
- Workflow examples (contract creation → service day → reporting)
- Authentication and authorization requirements
- Rate limiting and pagination

---

## 🔐 Security

### [SECURITY.md](../SECURITY.md)
Security architecture and threat model:
- Authentication flow (JWT + refresh tokens)
- Authorization strategy (company-level, ready for RBAC)
- Threat model and mitigations
- Data protection (encryption, sensitive field handling)
- OWASP compliance checklist
- Audit logging strategy

---

## ✅ Testing

### [TESTING_STRATEGY.md](../TESTING_STRATEGY.md)
Comprehensive testing approach:
- Test pyramid (unit, integration, E2E)
- Coverage metrics and analysis
- Test examples from the codebase
- CI/CD integration (GitHub Actions)
- Testing best practices

---

## 🚀 Deployment & Operations

### [DEPLOYMENT_AND_OPS.md](../DEPLOYMENT_AND_OPS.md)
Production deployment and operations:
- Full deployment architecture (Railway backend, Vercel frontend, PostgreSQL)
- CI/CD pipeline with GitHub Actions
- Database migrations and versioning
- Scaling and performance optimization
- Monitoring and alerting setup
- Incident response procedures
- Backup and disaster recovery

---

## 👨‍💻 Development

### [DEVELOPMENT_GUIDE.md](../DEVELOPMENT_GUIDE.md)
Getting started and contribution guidelines:
- Quick start (one-command setup)
- Manual setup instructions
- Development workflow (branching strategy, commit conventions)
- Code quality tools (ESLint, TypeScript, tests)
- Contribution process (PRs, reviews)
- Common tasks and commands
- Troubleshooting

### [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md)
Feature catalog and functional overview:
- Complete list of implemented features
- Module descriptions
- User workflows (from authentication to reporting)
- Future enhancements

---

## 📋 Quick Navigation by Role

### For Evaluators/Thesis Readers
1. Start: [MASTER_THESIS.md](../MASTER_THESIS.md)
2. Understand: [ARCHITECTURE.md](../ARCHITECTURE.md)
3. Deep dive: [DESIGN_DECISIONS.md](../DESIGN_DECISIONS.md)
4. Technical details: [DATABASE_DESIGN.md](../DATABASE_DESIGN.md), [SECURITY.md](../SECURITY.md)
5. Production-ready: [TESTING_STRATEGY.md](../TESTING_STRATEGY.md), [DEPLOYMENT_AND_OPS.md](../DEPLOYMENT_AND_OPS.md)

### For Developers
1. Start: [DEVELOPMENT_GUIDE.md](../DEVELOPMENT_GUIDE.md) (setup)
2. Learn: [ARCHITECTURE.md](../ARCHITECTURE.md) (how it works)
3. Build: [API_DOCUMENTATION.md](../API_DOCUMENTATION.md) + [DATABASE_DESIGN.md](../DATABASE_DESIGN.md)
4. Test: [TESTING_STRATEGY.md](../TESTING_STRATEGY.md)
5. Deploy: [DEPLOYMENT_AND_OPS.md](../DEPLOYMENT_AND_OPS.md)

### For DevOps/Ops Team
1. Start: [DEPLOYMENT_AND_OPS.md](../DEPLOYMENT_AND_OPS.md)
2. Security: [SECURITY.md](../SECURITY.md)
3. Monitoring: [DEPLOYMENT_AND_OPS.md](../DEPLOYMENT_AND_OPS.md) (monitoring section)

---

## 📁 Internal References

### [SESSION_NOTES.md](session-notes.md)
Development session notes and progress tracking. For reference only.

### [SESSION_TIMEOUT.md](SESSION_TIMEOUT.md)
Technical documentation of session timeout implementation.

**Note**: [AGENTS.md](../AGENTS.md) with code review rules is in the root directory (required for pre-commit hooks).

---

## 🔍 Additional Resources

- **Source Code**: See `src/` directory for implementation
- **Tests**: See `test/` directory for test suites
- **Configuration**: See root `Makefile`, `docker-compose.yml`, `Dockerfile`
- **Database**: See `drizzle/` for migrations

---

**Last Updated**: February 2026  
**Version**: 1.0 (Master's Thesis Edition)
