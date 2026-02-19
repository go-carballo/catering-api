# ChefOps - Presentación TFM
## Slides para Master's Thesis Final Project

---

> **Instrucciones**: Cada sección `## Slide X` representa una slide individual.
> Copiá el contenido a Google Slides, PowerPoint o Canva.

---

## Slide 1: Portada

**ChefOps**
Sistema de Gestión Operacional para Catering

Trabajo Final de Máster

Alumno: [Tu nombre completo]
Fecha: Febrero 2026

---

## Slide 2: El Problema

**Gestión de catering: un proceso manual y fragmentado**

- Las empresas de catering gestionan contratos, servicios diarios y reportes con hojas de cálculo
- No hay visibilidad en tiempo real de desviaciones entre lo esperado y lo servido
- La comunicación entre catering y clientes es descoordinada
- Los reportes financieros se generan manualmente

**Resultado**: Pérdida de tiempo, errores humanos, falta de control operacional

---

## Slide 3: La Solución

**ChefOps: Plataforma SaaS multi-tenant para catering**

Una aplicación web completa que permite:

- Gestionar contratos entre empresas de catering y clientes
- Programar y confirmar días de servicio (expected vs served)
- Detectar desviaciones en tiempo real
- Generar reportes automáticos (PDF)
- Administrar empresas, usuarios y empleados
- Dashboard con KPIs financieros

**Desplegado en producción y funcionando**

---

## Slide 4: Demo en Vivo

**URLs de producción:**

- Frontend: https://chefops.vercel.app
- Backend API: https://catering-api-production.up.railway.app/api
- API Docs (Swagger): https://catering-api-production.up.railway.app/docs

**Credenciales de prueba:**

| Email | Password | Tipo |
|-------|----------|------|
| delicias@example.com | password123 | CATERING |
| techcorp@example.com | password123 | CLIENT |

---

## Slide 5: Stack Tecnológico

**Backend**

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| NestJS | 11 | Framework backend |
| TypeScript | 5.7 | Lenguaje |
| PostgreSQL | 16 | Base de datos |
| Drizzle ORM | 0.45 | ORM type-safe |
| Vitest | 4 | Testing |
| Swagger | 11 | Documentación API |

**Frontend**

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Next.js | 16 | Framework frontend |
| React | 19 | UI Library |
| TypeScript | 5 | Lenguaje |
| TanStack Query | 5 | Estado del servidor |
| Tailwind CSS | 4 | Estilos |
| shadcn/ui | Latest | Componentes UI |
| Zod | 4 | Validación |

---

## Slide 6: Arquitectura General

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│  PostgreSQL   │
│   (Vercel)   │ API │  (Railway)   │     │  (Railway)    │
│   Next.js    │◀────│   NestJS     │◀────│              │
└──────────────┘     └──────────────┘     └──────────────┘
     React 19          Clean Arch           Drizzle ORM
   TanStack Query      DDD Modules          Migrations
   Tailwind CSS        JWT Auth             Advisory Locks
```

**Dos repositorios independientes, desplegados por separado**

- Frontend: Vercel (deploy automático en push a main)
- Backend: Railway (Docker container)
- Base de datos: PostgreSQL 16 en Railway

---

## Slide 7: Arquitectura Backend - Clean Architecture

```
┌─────────────────────────────┐
│     Presentation Layer      │  ← Controllers, DTOs, Swagger
│     (NestJS Controllers)    │
├─────────────────────────────┤
│     Application Layer       │  ← Services, Use Cases
│     (Business Logic)        │
├─────────────────────────────┤
│     Domain Layer            │  ← Entities, Value Objects, Rules
│     (Pure TypeScript)       │     NO dependencias externas
├─────────────────────────────┤
│     Infrastructure Layer    │  ← Repositories, DB, Email
│     (Drizzle, PostgreSQL)   │
└─────────────────────────────┘
```

**8 módulos**: Auth, Contract, Service Day, Catering, Client, User, Health, Seed

---

## Slide 8: Arquitectura Frontend - Capas

```
Pages (Next.js App Router)         ← Thin wrappers, routing
        ↓
Components (UI + Feature)          ← Presentación, interacción
        ↓
Hooks (React Query + Custom)       ← Estado servidor, lógica
        ↓
Services (API Integration)         ← Comunicación con backend
        ↓
API Client (Axios + Interceptors)  ← JWT, refresh token, errores
```

**10+ rutas autenticadas**: Dashboard, Contracts, Service Days, Companies, Users, Reports

---

## Slide 9: Funcionalidades Principales

**Autenticación y Seguridad**
- JWT + Refresh Tokens
- Session timeout con warning
- Forgot/Reset password por email
- Multi-tenant: cada empresa ve solo sus datos

**Gestión de Contratos**
- CRUD completo
- Estados: PENDING → ACTIVE → COMPLETED/CANCELLED
- Relación catering ↔ client

**Días de Servicio**
- Programación semanal
- Confirmación dual (expected vs served)
- Detección de desviaciones

**Dashboard y Reportes**
- KPIs financieros en tiempo real
- Alertas de desviación de presupuesto
- Generación de reportes PDF

---

## Slide 10: Patrones de Diseño Aplicados

| Patrón | Dónde | Por qué |
|--------|-------|---------|
| **Clean Architecture** | Backend completo | Independencia de frameworks |
| **Domain-Driven Design** | Entidades, Value Objects | Lógica de negocio encapsulada |
| **Repository Pattern** | Acceso a datos | Abstracción de persistencia |
| **Transactional Outbox** | Eventos de dominio | Garantiza entrega de eventos |
| **Result Types** | Manejo de errores | Type-safe, sin excepciones |
| **Factory Pattern** | Creación de entidades | Validación en construcción |
| **Strategy Pattern** | Reglas de negocio | Extensibilidad |
| **Composition** | Componentes React | Reutilización de UI |

---

## Slide 11: Base de Datos

**PostgreSQL 16 con Drizzle ORM**

Tablas principales:
- `companies` - Empresas (CATERING / CLIENT)
- `users` - Usuarios con roles (ADMIN / MANAGER / EMPLOYEE)
- `contracts` - Contratos entre catering y cliente
- `service_days` - Días de servicio programados
- `outbox_events` - Transactional Outbox para eventos

**Características**:
- Migraciones versionadas (Drizzle)
- Índices optimizados
- Multi-tenancy por company_id
- Advisory Locks para concurrencia

---

## Slide 12: Testing

**36 archivos de test en total**

| Tipo | Backend | Frontend | Total |
|------|---------|----------|-------|
| Unit Tests | 19 | 2 | 21 |
| Integration Tests | 7 | 6 | 13 |
| E2E Tests | 2 | 0 | 2 |
| **Total** | **28** | **8** | **36** |

**Herramientas**: Vitest, Supertest, Testing Library, Happy DOM

**Cobertura**: ~78.5% en backend (módulos core)

---

## Slide 13: DevOps y Despliegue

```
GitHub (push to main)
        ↓
GitHub Actions (CI)
  ├── Lint + Type Check
  ├── Run Tests
  └── Build
        ↓
┌───────────────┐    ┌───────────────┐
│   Vercel      │    │   Railway     │
│   Frontend    │    │   Backend     │
│   Auto-deploy │    │   Docker      │
└───────────────┘    └───────────────┘
                          ↓
                    ┌───────────────┐
                    │  PostgreSQL   │
                    │  Railway DB   │
                    └───────────────┘
```

**Zero-downtime deployments**

---

## Slide 14: Métricas del Proyecto

| Métrica | Backend | Frontend | Total |
|---------|---------|----------|-------|
| **Archivos TypeScript** | 129 | 101 | **230** |
| **Líneas de código** | 18,362 | 10,762 | **29,124** |
| **Tests** | 28 | 8 | **36** |
| **Documentación** | 9 docs | 3 docs | **12 docs** |

**Otros datos**:
- 8 módulos backend
- 10+ rutas frontend
- 16+ componentes UI (shadcn/ui)
- 7 custom hooks
- 10 servicios API
- Deployed en producción

---

## Slide 15: Documentación

**12 documentos técnicos creados**

**Backend (9 docs)**:
- MASTER_THESIS.md - Overview ejecutivo
- ARCHITECTURE.md - Clean Architecture y DDD
- DESIGN_DECISIONS.md - Trade-offs técnicos
- API_DOCUMENTATION.md - Referencia REST API
- DATABASE_DESIGN.md - Esquema y optimización
- SECURITY.md - Autenticación y amenazas
- TESTING_STRATEGY.md - Pirámide de tests
- DEPLOYMENT_AND_OPS.md - CI/CD y monitoreo
- DEVELOPMENT_GUIDE.md - Setup y workflows

**Frontend (3 docs)**:
- ARCHITECTURE.md - Diseño y data flow
- DEVELOPMENT_GUIDE.md - Setup y convenciones
- COMPONENTS_DOCUMENTATION.md - Catálogo de componentes

---

## Slide 16: Decisiones Técnicas Clave

**¿Por qué NestJS y no Express?**
→ Arquitectura modular, DI nativo, decoradores, Swagger integrado

**¿Por qué Next.js y no Vite/React puro?**
→ Server Components, SSR, file-based routing, optimización automática

**¿Por qué TanStack Query y no Redux?**
→ Server state ≠ UI state, caching automático, menos boilerplate

**¿Por qué Drizzle y no Prisma/TypeORM?**
→ Type-safe SQL, mejor performance, control total sobre queries

**¿Por qué JWT a nivel empresa y no usuario?**
→ Simplifica multi-tenancy, cada request sabe a qué empresa pertenece

---

## Slide 17: Qué Aprendí

- Implementar Clean Architecture en un proyecto real
- Diseñar sistemas multi-tenant desde cero
- Aplicar Domain-Driven Design con TypeScript
- Gestionar estado complejo con React Query
- Desplegar full-stack en producción (Vercel + Railway)
- Escribir tests a diferentes niveles (unit, integration, E2E)
- Documentar un proyecto de forma profesional
- Tomar decisiones de arquitectura con trade-offs reales

---

## Slide 18: Mejoras Futuras

- **RBAC completo**: Enforcing roles (ADMIN/MANAGER/EMPLOYEE) en endpoints
- **Notificaciones en tiempo real**: WebSockets para alertas
- **App móvil**: React Native para confirmación de servicios en campo
- **Analytics avanzados**: Dashboards con gráficos de tendencias
- **Multi-idioma**: i18n para internacionalización
- **Rate limiting**: Protección contra abuso de API
- **Audit logging**: Registro completo de acciones de usuarios

---

## Slide 19: Cierre

**ChefOps no es un proyecto académico.**
**Es un sistema en producción, desplegado y funcionando.**

- 29,000+ líneas de TypeScript
- 36 tests automatizados
- 12 documentos técnicos
- Desplegado en Vercel + Railway
- Clean Architecture + DDD
- Multi-tenant por diseño

**Repositorios:**
- Backend: github.com/go-carballo/catering-api
- Frontend: github.com/go-carballo/catering-frontend

**Demo:**
- https://chefops.vercel.app

---

**Gracias**

---
