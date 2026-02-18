# Catering Platform — Project Overview

## ¿Qué es?

Sistema **multi-tenant de gestión de contratos de catering** compuesto por dos repositorios:

- **Backend**: NestJS 11 + PostgreSQL 16 + Drizzle ORM → [`catering-api`](https://github.com/go-carballo/catering-api)
- **Frontend**: Next.js 16 + React 19 + TanStack Query + shadcn/ui → [`catering-frontend`](https://github.com/go-carballo/catering-frontend)

Gestiona el ciclo de vida completo de contratos entre empresas de catering y sus clientes: creación, pausado, reanudación, terminación, programación de días de servicio, confirmación de cantidades y reportes.

---

---

# BACKEND — `catering-api`

## Arquitectura

El backend sigue **Clean Architecture** con separación en 3 capas por módulo:

| Capa               | Responsabilidad                                                       |
| ------------------ | --------------------------------------------------------------------- |
| **Domain**         | Entidades ricas, reglas de negocio puras, errores de dominio, eventos |
| **Application**    | Servicios, DTOs, Use Cases, Event Handlers                            |
| **Infrastructure** | Controllers, Repositories (Drizzle), adaptadores externos             |

### Estructura de carpetas

```
src/
├── modules/
│   ├── auth/              # Autenticación y sesiones
│   ├── catering/          # Empresas de catering (CRUD)
│   ├── client/            # Empresas cliente (CRUD)
│   ├── contract/          # Contratos entre catering y cliente
│   ├── service-day/       # Días de servicio, confirmaciones, reportes
│   ├── user/              # Usuarios por empresa
│   ├── health/            # Health check
│   └── seed/              # Seeding de datos de prueba
├── shared/
│   ├── domain/            # Errores de dominio, puertos, utilidades
│   ├── events/            # Event bus, domain events, idempotencia
│   ├── outbox/            # Transactional Outbox Pattern
│   ├── guards/            # JWT Guard, Company Type Guard
│   ├── decorators/        # @Public(), @GetCompany(), @RequireCompanyType()
│   ├── middleware/        # Session activity tracking
│   ├── ports/             # NotificationPort, AnalyticsPort
│   ├── infrastructure/    # Database (Drizzle), Email, Clock
│   └── testing/           # Mocks para testing
```

**8 módulos** — Los más maduros arquitectónicamente son **contract** y **service-day**, con entidades ricas, use cases con resultado discriminado, y reglas de dominio como funciones puras.

---

## Base de Datos (12 tablas)

| Tabla                   | Descripción                                                            |
| ----------------------- | ---------------------------------------------------------------------- |
| `companies`             | Unificada para CATERING y CLIENT (STI pattern via `company_type` enum) |
| `catering_profiles`     | Extensión 1:1 — `daily_capacity`                                       |
| `client_profiles`       | Extensión 1:1 — `work_mode` (REMOTE/HYBRID/ONSITE)                     |
| `client_office_days`    | Días de oficina del cliente (1-7, lunes a domingo)                     |
| `users`                 | Usuarios por empresa, roles: ADMIN / MANAGER / EMPLOYEE                |
| `contracts`             | Vincula catering ↔ client, máquina de estados                          |
| `contract_service_days` | Qué días de la semana cubre el contrato                                |
| `service_days`          | Instancias concretas de servicio por fecha                             |
| `refresh_tokens`        | Rotación de refresh tokens (hash bcrypt)                               |
| `password_reset_tokens` | Tokens de reseteo de contraseña (15min expiry)                         |
| `outbox_events`         | Transactional Outbox — eventos pendientes de procesar                  |
| `processed_events`      | Idempotencia — tracking de eventos ya procesados por handler           |

### Relaciones clave

- `companies` 1:1 → `catering_profiles` | `client_profiles`
- `companies` 1:N → `users`
- `contracts` N:1 → `companies` (catering + client)
- `contracts` 1:N → `contract_service_days`
- `contracts` 1:N → `service_days`
- Constraint único: no puede haber 2 contratos ACTIVE entre el mismo par catering/client

---

## Endpoints REST

Todos prefijados con `/api`. Swagger disponible en `/docs`.

### Auth (`/api/auth`)

| Método | Ruta               | Auth    | Descripción                                          |
| ------ | ------------------ | ------- | ---------------------------------------------------- |
| POST   | `/login`           | Público | Login, retorna JWT + refresh token                   |
| POST   | `/refresh`         | Público | Refrescar access token                               |
| POST   | `/logout`          | Privado | Revocar refresh token                                |
| POST   | `/change-password` | Privado | Cambiar contraseña (revoca todos los refresh tokens) |
| POST   | `/forgot-password` | Público | Envía email de reseteo                               |
| POST   | `/reset-password`  | Público | Resetear con token                                   |
| GET    | `/session-status`  | Privado | Retorna último timestamp de actividad                |

### Caterings (`/api/caterings`)

| Método | Ruta   | Auth    | Descripción                |
| ------ | ------ | ------- | -------------------------- |
| GET    | `/`    | Privado | Listar todas las caterings |
| GET    | `/:id` | Privado | Obtener una catering       |
| POST   | `/`    | Público | Registrar nueva catering   |
| PATCH  | `/:id` | Privado | Actualizar                 |
| DELETE | `/:id` | Privado | Soft delete                |

### Clients (`/api/clients`)

| Método | Ruta   | Auth    | Descripción              |
| ------ | ------ | ------- | ------------------------ |
| GET    | `/`    | Privado | Listar todos los clients |
| GET    | `/:id` | Privado | Obtener un client        |
| POST   | `/`    | Público | Registrar nuevo client   |
| PATCH  | `/:id` | Privado | Actualizar               |
| DELETE | `/:id` | Privado | Soft delete              |

### Contracts (`/api/contracts`)

| Método | Ruta               | Auth    | Restricción | Descripción                                |
| ------ | ------------------ | ------- | ----------- | ------------------------------------------ |
| GET    | `/`                | Privado | —           | Listar contratos de la empresa autenticada |
| GET    | `/finance-metrics` | Privado | CLIENT only | Métricas financieras (dashboard)           |
| GET    | `/:id`             | Privado | —           | Detalle de contrato (debe ser parte)       |
| POST   | `/`                | Privado | —           | Crear contrato                             |
| POST   | `/:id/pause`       | Privado | CLIENT only | Pausar contrato                            |
| POST   | `/:id/resume`      | Privado | CLIENT only | Reanudar contrato                          |
| POST   | `/:id/terminate`   | Privado | CLIENT only | Terminar contrato                          |

### Service Days

| Método | Ruta                                           | Auth    | Restricción   | Descripción                    |
| ------ | ---------------------------------------------- | ------- | ------------- | ------------------------------ |
| GET    | `/contracts/:contractId/service-days`          | Privado | —             | Query con rango de fechas      |
| POST   | `/contracts/:contractId/service-days/generate` | Privado | —             | Generar días de servicio       |
| POST   | `/service-days/:id/confirm-expected`           | Privado | CLIENT only   | Confirmar cantidad esperada    |
| POST   | `/service-days/:id/confirm-served`             | Privado | CATERING only | Confirmar cantidad servida     |
| GET    | `/contracts/:id/reports/weekly`                | Privado | —             | Reporte semanal (JSON)         |
| GET    | `/contracts/:id/reports/weekly/csv`            | Privado | —             | Reporte semanal (CSV download) |

### Health (`/api/health`)

| Método | Ruta | Auth    | Descripción                        |
| ------ | ---- | ------- | ---------------------------------- |
| GET    | `/`  | Público | Health check con conectividad a DB |

### Seed (`/api/seed`)

| Método | Ruta | Auth    | Descripción                   |
| ------ | ---- | ------- | ----------------------------- |
| POST   | `/`  | Público | Seed de datos de prueba en DB |

---

## Autenticación y Autorización

- **JWT Bearer** via Passport.js — access token con expiración de **24 horas**
- **Refresh tokens**: 7 días (o **30 días** con `rememberMe`) — almacenados como hash bcrypt
- **Guards globales**: `JwtAuthGuard` + `CompanyTypeGuard` aplicados a todas las rutas
- **Decoradores**:
  - `@Public()` — bypass de autenticación
  - `@GetCompany()` — extrae la empresa autenticada del request
  - `@RequireCompanyType('CLIENT' | 'CATERING')` — restringe por tipo de empresa
- **Session Activity Middleware** — actualiza `last_activity_at` en cada request autenticado
- **Importante**: La autenticación es a nivel **empresa**, no usuario. El JWT payload contiene `sub` (company ID), `email`, `companyType`

---

## Domain Events & Transactional Outbox Pattern

### Eventos de dominio

| Evento                | Trigger                 |
| --------------------- | ----------------------- |
| `contract.created`    | Al crear un contrato    |
| `contract.paused`     | Al pausar un contrato   |
| `contract.resumed`    | Al reanudar un contrato |
| `contract.terminated` | Al terminar un contrato |

### Flujo del Outbox

```
1. Service modifica el agregado
2. Dentro de la MISMA transacción, graba el evento en `outbox_events`
   └── Garantía: si la transacción falla, el evento tampoco se persiste
3. OutboxProcessor (cron cada 5 seg) reclama eventos PENDING
4. Publica al InMemoryEventBus
5. Event handlers ejecutan (con idempotencia via processed_events)
```

### Features del Outbox

- **Backoff exponencial con jitter** para reintentos
- **Recovery de locks stale** (timeout 60 segundos)
- **Dead Letter Queue** — status DEAD después de 5 reintentos
- **Graceful shutdown** — espera procesamiento en curso
- **`processNow()`** para testing
- **`getStats()` y `getDeadEvents()`** para monitoreo/ops
- **`retryDeadEvents()`** para reprocessar eventos fallidos
- **Advisory Locks de PostgreSQL** (`pg_try_advisory_lock`) para prevenir ejecución duplicada entre instancias

---

## Scheduler (Jobs automáticos)

| Job                           | Frecuencia     | Descripción                                                                                               |
| ----------------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `generateUpcomingServiceDays` | Diario (00:00) | Genera service days para los próximos 7 días en contratos activos. También se ejecuta en bootstrap        |
| `applyFallbackForUnconfirmed` | Cada hora      | Aplica `minDailyQuantity` como fallback a service days no confirmados pasado el deadline de notice period |

---

## Rich Domain Entities

Las entidades no son simples DTOs — contienen **comportamiento y reglas de negocio**:

### ContractEntity

- Métodos de guarda: `ensureActive()`, `ensureAuthorized()`
- Máquina de estados: ACTIVE → PAUSED → ACTIVE, ACTIVE → TERMINATED
- Validaciones: un contrato TERMINATED no puede pausarse ni reanudarse

### ServiceDayEntity

- `confirmExpectedQuantity()` — valida rango min/max, notice period
- `confirmServedQuantity()` — solo el catering puede confirmar
- `applyFallback()` — aplica cantidad mínima si no se confirmó

### Separación Data/Entity

- Interfaces `*Data` para persistencia/transferencia
- Clases `*Entity` con lógica de dominio
- Métodos `toData()` y `fromData()` para conversión

---

## Testing

| Tipo        | Cantidad     | Herramienta              | Comando                 |
| ----------- | ------------ | ------------------------ | ----------------------- |
| Unit        | ~14 archivos | Vitest                   | `pnpm test`             |
| Integration | 7 archivos   | Vitest + Docker Postgres | `pnpm test:integration` |
| E2E         | 2 archivos   | Vitest + Supertest       | `pnpm test:e2e`         |
| **Todos**   |              |                          | `pnpm test:all`         |

### Cobertura por módulo

| Módulo      | Unit | Integration | E2E |
| ----------- | ---- | ----------- | --- |
| contract    | ✅   | ✅          | —   |
| service-day | ✅   | ✅          | —   |
| catering    | ✅   | —           | —   |
| client      | ✅   | —           | —   |
| health      | ✅   | —           | —   |
| outbox      | ✅   | —           | —   |
| events      | ✅   | —           | —   |
| guards      | ✅   | —           | —   |
| auth        | ❌   | ❌          | —   |
| user        | ❌   | ❌          | —   |
| seed        | ❌   | ❌          | —   |

---

## Stack Tecnológico

| Componente      | Tecnología                          |
| --------------- | ----------------------------------- |
| Runtime         | Node.js ≥ 20, TypeScript (strict)   |
| Framework       | NestJS 11                           |
| Base de datos   | PostgreSQL 16                       |
| ORM             | Drizzle ORM                         |
| Auth            | Passport.js + JWT                   |
| Validación      | class-validator + class-transformer |
| Testing         | Vitest                              |
| Documentación   | Swagger (NestJS Swagger)            |
| Email           | Nodemailer                          |
| Package Manager | pnpm                                |
| Build           | SWC (via unplugin-swc)              |

---

## Deployment

| Componente | Plataforma | URL                                        |
| ---------- | ---------- | ------------------------------------------ |
| Backend    | Railway    | (configurado via Dockerfile)               |
| Frontend   | Vercel     | `https://catering-frontend-two.vercel.app` |
| DB         | PostgreSQL | (Railway managed)                          |

---

## Puntos fuertes / Decisiones arquitectónicas

1. **Clean Architecture real** — separación de capas con puertos y adaptadores, no solo carpetas decorativas
2. **Transactional Outbox Pattern** — garantía de entrega de eventos con dead letter queue e idempotencia
3. **Rich Domain Entities** — entidades con comportamiento, métodos de guarda, y máquina de estados
4. **Use Cases como ciudadanos de primera clase** — resultado discriminado (union types), no exceptions para control de flujo
5. **Advisory Locks de PostgreSQL** — scheduling distribuido sin dependencias externas
6. **Refresh Token Rotation** — seguridad con bcrypt hashing y revocación masiva
7. **Separación Data/Entity** — `toData()` / `fromData()` para mapeo limpio entre capas
8. **Reglas de dominio como funciones puras** — testeables sin infraestructura
9. **Scheduler automático** — generación proactiva de service days, fallback para no confirmados
10. **Swagger auto-generado** — documentación de API siempre actualizada

---

# FRONTEND — `catering-frontend`

## Stack Tecnológico (Frontend)

| Componente      | Tecnología                                        |
| --------------- | ------------------------------------------------- |
| Framework       | Next.js 16.1.4 (App Router)                       |
| UI Library      | React 19                                          |
| Lenguaje        | TypeScript (strict)                               |
| Estilos         | Tailwind CSS v4                                   |
| Componentes UI  | shadcn/ui (estilo new-york) + Radix UI primitives |
| Iconos          | Lucide React                                      |
| Data Fetching   | TanStack React Query v5                           |
| Formularios     | React Hook Form v7 + Zod v4                       |
| PDF             | jsPDF + jsPDF-AutoTable                           |
| Notificaciones  | Sonner (toasts)                                   |
| Testing         | Vitest + Testing Library + happy-dom              |
| Package Manager | pnpm                                              |
| Dev port        | 3001                                              |

---

## Estructura de Carpetas (Frontend)

```
src/
├── app/
│   ├── page.tsx                    # Landing page pública
│   ├── login/page.tsx              # Login
│   ├── forgot-password/page.tsx    # Olvidé contraseña
│   ├── reset-password/page.tsx     # Resetear contraseña (con token)
│   ├── layout.tsx                  # Root layout (providers)
│   ├── globals.css                 # Tailwind + theme variables
│   └── (protected)/               # Route group con auth guard
│       ├── layout.tsx              # Sidebar + session timeout
│       ├── dashboard/page.tsx      # Dashboard dual (CLIENT vs CATERING)
│       ├── contracts/page.tsx      # Lista de contratos
│       ├── contracts/[id]/
│       │   ├── service-days/page.tsx  # Días de servicio del contrato
│       │   └── reports/page.tsx       # Reportes semanales + PDF
│       ├── service-days/page.tsx   # Vista consolidada de service days
│       ├── companies/page.tsx      # Gestión de empresas
│       └── users/page.tsx          # Gestión de usuarios
├── components/
│   ├── ui/                # 16 componentes shadcn/ui (button, card, dialog, table, etc.)
│   ├── layout/            # Sidebar, Breadcrumbs
│   ├── auth/              # ChangePasswordDialog, SessionWarningModal
│   ├── dashboard/         # BudgetCard, KPIsGrid, DeviationAlert, RecentServicesTable, etc.
│   ├── contracts/         # CreateContractDialog
│   ├── companies/         # CateringFormDialog, ClientFormDialog
│   └── users/             # UserFormDialog
├── hooks/                 # Custom hooks (React Query wrappers)
│   ├── use-caterings.ts
│   ├── use-clients.ts
│   ├── use-contracts.ts
│   ├── use-finance-metrics.ts
│   ├── use-service-days.ts
│   ├── use-session-timeout.ts
│   └── use-users.ts
├── services/              # API client layer
│   ├── api.ts             # Base fetch wrapper con refresh automático
│   ├── auth.service.ts
│   ├── caterings.service.ts
│   ├── clients.service.ts
│   ├── contracts.service.ts
│   ├── service-days.service.ts
│   ├── reports.service.ts
│   ├── change-password.service.ts
│   ├── reset-password.service.ts
│   └── users.service.ts
├── providers/
│   ├── auth-provider.tsx  # Context de auth (login, logout, refresh)
│   └── query-provider.tsx # TanStack Query client config
├── types/                 # TypeScript interfaces/types
├── lib/
│   ├── utils.ts           # cn() helper (clsx + tailwind-merge)
│   ├── formatters.ts      # Formateo de fechas, moneda, etc.
│   ├── currency-formatter.ts
│   ├── date-formatter.ts
│   ├── pdf-generator.ts   # Generación de reportes PDF
│   └── validations/       # Schemas Zod (catering, client, contract, users)
└── config/
    └── env.ts             # API URL configuration
```

---

## Rutas / Páginas

### Públicas

| Ruta               | Descripción                            |
| ------------------ | -------------------------------------- |
| `/`                | Landing page profesional               |
| `/login`           | Login con selector de tipo de cuenta   |
| `/forgot-password` | Solicitud de reseteo de contraseña     |
| `/reset-password`  | Formulario de nueva contraseña (token) |

### Protegidas (requieren autenticación)

| Ruta                          | Descripción                                                           |
| ----------------------------- | --------------------------------------------------------------------- |
| `/dashboard`                  | Dashboard dual: CLIENT → métricas financieras, CATERING → operaciones |
| `/contracts`                  | Lista de contratos (crear, pausar, reanudar, terminar)                |
| `/contracts/:id/service-days` | Días de servicio de un contrato (confirmar esperado/servido)          |
| `/contracts/:id/reports`      | Reportes semanales con descarga CSV y generación de PDF               |
| `/service-days`               | Vista consolidada de service days de todos los contratos              |
| `/companies`                  | CRUD de empresas catering/client                                      |
| `/users`                      | Gestión de usuarios por empresa                                       |

---

## Autenticación en el Frontend

### Flujo

```
1. Login → POST /api/auth/login → recibe { token, refreshToken, company }
2. Tokens se guardan en localStorage (token, refresh_token, company, token_expiry)
3. AuthProvider expone context: { company, token, login(), logout(), refreshAccessToken() }
4. Cada request incluye Authorization: Bearer <token>
5. En caso de 401 → intenta refresh automático → si falla → logout + redirect a /login
```

### Session Timeout

- **60 minutos** de inactividad → muestra modal de advertencia
- **5 minutos** de gracia para extender
- Escucha eventos: mouse, teclado, scroll, touch
- Hook `useSessionTimeout` + componente `SessionWarningModal`

---

## Data Fetching — TanStack React Query

### Patrón de Query Keys

```typescript
// Ejemplo: contractKeys
const contractKeys = {
  all: ['contracts'] as const,
  list: () => [...contractKeys.all, 'list'] as const,
  detail: (id: string) => [...contractKeys.all, 'detail', id] as const,
};
```

### Configuración global

| Parámetro | Valor                |
| --------- | -------------------- |
| staleTime | 60s (default global) |
| Finance   | 5 min                |
| Service   | 30s                  |

### Mutations

- Invalidan cache de lista tras crear/editar
- `setQueryData` para actualizar detalle sin refetch
- Toast de éxito/error con Sonner

---

## Formularios — React Hook Form + Zod

- Schemas de validación Zod en `src/lib/validations/`
- Resolución via `@hookform/resolvers`
- Dialogs modales para crear/editar (catering, client, contract, user)
- Validaciones: email, tax ID, rangos numéricos, contraseñas

---

## Componentes UI (shadcn/ui)

16 componentes base de shadcn/ui con Radix UI como primitiva:

`AlertDialog` · `Badge` · `Button` · `Card` · `Checkbox` · `Dialog` · `DropdownMenu` · `Form` · `Input` · `Label` · `Progress` · `Select` · `Skeleton` · `Sonner` · `Table` · `Tabs`

### Dashboard Components (módulo propio)

| Componente            | Descripción                                          |
| --------------------- | ---------------------------------------------------- |
| `BudgetCard`          | Tarjeta de presupuesto con barra de progreso         |
| `KPIsGrid`            | Grid de KPIs: costo/persona, utilización, desviación |
| `DeviationAlert`      | Alerta visual cuando la desviación supera umbral     |
| `RecentServicesTable` | Tabla de últimos servicios con cantidades y estado   |
| `EmptyState`          | Estado vacío cuando no hay datos                     |
| `ErrorState`          | Estado de error con retry                            |
| `LoadingSkeleton`     | Skeleton loading para el dashboard                   |
| `CateringHome`        | Vista home específica para caterings                 |

---

## API Client Layer

### `api.ts` — Custom fetch wrapper

```typescript
// Wrapper genérico tipado sobre fetch nativo
async function api<T>(url: string, options?: RequestOptions): Promise<T>;

// Intercepta 401 → intenta refresh automático → retry original request
// Helpers: apiGet<T>, apiPost<T>, apiPatch<T>, apiDelete<T>
// ApiError class con { status, statusText, data }
```

### Servicios por dominio

Cada servicio es un **objeto** (no clase) con métodos async tipados:

```
authService      → login, refreshToken, logout, sessionStatus
cateringsService → getAll, getById, create, update, delete
clientsService   → getAll, getById, create, update, delete
contractsService → getAll, getById, create, pause, resume, terminate
serviceDaysService → getByContract, generate, confirmExpected, confirmServed
reportsService   → getWeekly, downloadWeeklyCsv
usersService     → getAll, create, update, delete
```

---

## PDF & Reportes

- **Reportes semanales**: JSON (tabla en pantalla) + descarga CSV
- **Generación de PDF**: `jsPDF` + `jsPDF-AutoTable` con layout profesional
- Formateo de moneda en locale `es-AR` (peso argentino)

---

## Testing (Frontend)

| Tipo | Cantidad   | Herramienta              | Comando     |
| ---- | ---------- | ------------------------ | ----------- |
| Unit | 8 archivos | Vitest + Testing Library | `pnpm test` |

### Archivos con tests

| Archivo                                               | Qué testea                            |
| ----------------------------------------------------- | ------------------------------------- |
| `components/dashboard/budget-card.test.tsx`           | Renderizado, formato moneda, progreso |
| `components/dashboard/kpis-grid.test.tsx`             | KPIs, formato porcentaje, colores     |
| `components/dashboard/deviation-alert.test.tsx`       | Alertas por umbral de desviación      |
| `components/dashboard/empty-state.test.tsx`           | Estado vacío                          |
| `components/dashboard/error-state.test.tsx`           | Estado de error, callback retry       |
| `components/dashboard/recent-services-table.test.tsx` | Tabla de servicios, formato fechas    |
| `lib/currency-formatter.test.ts`                      | Formateo de moneda                    |
| `lib/date-formatter.test.ts`                          | Formateo de fechas                    |

### Sin tests

- Páginas (pages)
- Hooks (React Query)
- Services (API client)
- Auth flow (providers)
- Form dialogs

---

## Deployment

| Componente | Plataforma | URL / Puerto                               |
| ---------- | ---------- | ------------------------------------------ |
| Backend    | Railway    | `catering-api-production.up.railway.app`   |
| Frontend   | Vercel     | `https://catering-frontend-two.vercel.app` |
| DB         | Railway    | PostgreSQL managed                         |
| API Docs   | Swagger    | `/docs` (en el backend)                    |
| Dev API    | Local      | `http://localhost:3000`                    |
| Dev Front  | Local      | `http://localhost:3001`                    |

---

## Stack Completo (Full-Stack)

| Capa            | Tecnología                                                   |
| --------------- | ------------------------------------------------------------ |
| Frontend        | Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui |
| Data Fetching   | TanStack React Query v5                                      |
| Formularios     | React Hook Form v7 · Zod v4                                  |
| Backend         | NestJS 11 · TypeScript (strict)                              |
| Base de datos   | PostgreSQL 16 · Drizzle ORM                                  |
| Auth            | JWT · Passport.js · Refresh Token Rotation · bcrypt          |
| Eventos         | Transactional Outbox · InMemory Event Bus · Idempotencia     |
| Email           | Nodemailer                                                   |
| Testing         | Vitest · Testing Library · Supertest                         |
| CI/CD           | Railway (backend) · Vercel (frontend)                        |
| Docs            | Swagger (auto-generado)                                      |
| Package Manager | pnpm (ambos repos)                                           |

---

## Puntos Fuertes del Proyecto (para presentación)

### Backend

1. **Clean Architecture real** — separación de capas con puertos y adaptadores, no solo carpetas decorativas
2. **Transactional Outbox Pattern** — garantía de entrega de eventos con dead letter queue e idempotencia
3. **Rich Domain Entities** — entidades con comportamiento, métodos de guarda, y máquina de estados
4. **Use Cases como ciudadanos de primera clase** — resultado discriminado (union types), no exceptions para control de flujo
5. **Advisory Locks de PostgreSQL** — scheduling distribuido sin dependencias externas
6. **Refresh Token Rotation** — seguridad con bcrypt hashing y revocación masiva
7. **Separación Data/Entity** — `toData()` / `fromData()` para mapeo limpio entre capas
8. **Reglas de dominio como funciones puras** — testeables sin infraestructura
9. **Scheduler automático** — generación proactiva de service days, fallback para no confirmados
10. **Swagger auto-generado** — documentación de API siempre actualizada

### Frontend

1. **Next.js App Router** con route groups para separar rutas públicas de protegidas
2. **TanStack React Query** — cache inteligente con query key factories y stale times por dominio
3. **shadcn/ui + Radix** — componentes accesibles y composables, no una librería monolítica
4. **Dashboard dual** — vista diferenciada para CLIENT (financiero) vs CATERING (operacional)
5. **Zod + React Hook Form** — validación type-safe de formularios
6. **Generación de PDFs** client-side con jsPDF
7. **Session timeout** con detección de inactividad y modal de advertencia
8. **Services layer tipado** — cada dominio tiene su service object con métodos async tipados
9. **Formateo localizado** — moneda en `es-AR`, fechas formateadas
10. **Componentes de dashboard modularizados** — con tests unitarios
