# API Documentation
## Complete Reference & Usage Guide

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Error Handling](#error-handling)
4. [Auth Endpoints](#auth-endpoints)
5. [Companies Endpoints](#companies-endpoints)
6. [Users Endpoints](#users-endpoints)
7. [Contracts Endpoints](#contracts-endpoints)
8. [Service Days Endpoints](#service-days-endpoints)
9. [Reports Endpoints](#reports-endpoints)
10. [Health Endpoints](#health-endpoints)

---

## Overview

### Base URL

| Environment | URL |
|-------------|-----|
| **Development** | `http://localhost:3000/api` |
| **Production** | `https://catering-api-production.up.railway.app/api` |

### API Documentation (Swagger)

Live Swagger UI available at:
- **Dev**: `http://localhost:3000/docs`
- **Production**: `https://catering-api-production.up.railway.app/docs`

### Request/Response Format

All requests/responses are JSON:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "catering@example.com",
  "password": "secure-password",
  "rememberMe": false
}
```

```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenExpiresIn": 86400,
  "company": {
    "id": "company-123",
    "email": "catering@example.com",
    "type": "CATERING"
  }
}
```

### Response Format

**Success (2xx)**:
```json
{
  "statusCode": 200,
  "data": { /* actual data */ },
  "timestamp": "2026-02-18T15:30:00Z"
}
```

**Error (4xx/5xx)**:
```json
{
  "statusCode": 400,
  "error": "INVALID_REQUEST",
  "message": "Email is required",
  "timestamp": "2026-02-18T15:30:00Z"
}
```

---

## Authentication

### JWT Bearer Token

All protected endpoints require an `Authorization` header:

```http
GET /api/contracts
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Token Format

JWT payload contains:
```json
{
  "sub": "company-123",
  "email": "catering@example.com",
  "companyType": "CATERING",
  "iat": 1708190400,
  "exp": 1708276800
}
```

- `sub`: Company ID (authentication scope)
- `email`: Company email
- `companyType`: Either `CATERING` or `CLIENT`
- `exp`: Expiration timestamp (24 hours from issue)

### Token Refresh

When access token expires (401 response), use refresh token:

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

Response:
```json
{
  "token": "new-access-token",
  "refreshToken": "new-refresh-token",
  "tokenExpiresIn": 86400
}
```

### Refresh Token Expiry

- **Default**: 7 days
- **With "Remember Me"**: 30 days
- Stored as bcrypt hash in database (plaintext never persisted)

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| **200** | Success | GET request succeeded |
| **201** | Created | POST created new resource |
| **400** | Bad Request | Validation failed, malformed input |
| **401** | Unauthorized | Missing or invalid token |
| **403** | Forbidden | Authenticated but not authorized |
| **404** | Not Found | Resource doesn't exist |
| **409** | Conflict | Duplicate resource, uniqueness violation |
| **422** | Unprocessable Entity | Semantic error (e.g., invalid state transition) |
| **500** | Server Error | Unexpected error |

### Error Response Format

```json
{
  "statusCode": 400,
  "error": "INVALID_DATES",
  "message": "End date must be after start date",
  "timestamp": "2026-02-18T15:30:00Z"
}
```

### Common Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `INVALID_CREDENTIALS` | 401 | Email/password incorrect |
| `INVALID_DATES` | 422 | Date range invalid |
| `DUPLICATE_CONTRACT` | 409 | Active contract already exists |
| `INVALID_STATE_TRANSITION` | 422 | Contract state doesn't allow operation |
| `UNAUTHORIZED` | 403 | Company not authorized for resource |
| `CONTRACT_NOT_FOUND` | 404 | Contract doesn't exist |
| `SERVICE_DAY_NOT_FOUND` | 404 | Service day doesn't exist |

---

## Auth Endpoints

### POST /auth/login

Authenticate and receive tokens.

**Request**:
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "catering@example.com",
  "password": "password123",
  "rememberMe": false
}
```

**Parameters**:
- `email` (string, required): Company email
- `password` (string, required): Company password
- `rememberMe` (boolean, optional): 30-day refresh token instead of 7-day

**Response** (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenExpiresIn": 86400,
  "company": {
    "id": "cat-123",
    "email": "catering@example.com",
    "type": "CATERING"
  }
}
```

**Errors**:
- 401 `INVALID_CREDENTIALS` - Wrong email/password
- 404 `COMPANY_NOT_FOUND` - Email not registered

---

### POST /auth/refresh

Refresh access token using refresh token.

**Request**:
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** (200):
```json
{
  "token": "new-access-token",
  "refreshToken": "new-refresh-token",
  "tokenExpiresIn": 86400
}
```

**Errors**:
- 401 `INVALID_TOKEN` - Refresh token invalid/expired
- 401 `TOKEN_REVOKED` - Refresh token was revoked

---

### POST /auth/logout

Revoke refresh token and end session.

**Request**:
```http
POST /api/auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** (200):
```json
{
  "message": "Logged out successfully"
}
```

---

### POST /auth/forgot-password

Request password reset email.

**Request**:
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "catering@example.com"
}
```

**Response** (200):
```json
{
  "message": "Password reset email sent"
}
```

**Note**: Always returns 200 for security (doesn't reveal if email exists)

---

### POST /auth/reset-password

Reset password using token from email.

**Request**:
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "reset-token-from-email",
  "newPassword": "new-secure-password"
}
```

**Response** (200):
```json
{
  "message": "Password reset successfully"
}
```

**Errors**:
- 400 `INVALID_TOKEN` - Token invalid/expired
- 422 `WEAK_PASSWORD` - Password doesn't meet requirements

---

### POST /auth/change-password

Change password while authenticated.

**Request**:
```http
POST /api/auth/change-password
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "currentPassword": "current-password",
  "newPassword": "new-secure-password"
}
```

**Response** (200):
```json
{
  "message": "Password changed successfully"
}
```

**Note**: Revokes all refresh tokens (forces re-login on all devices)

---

### GET /auth/session-status

Check session activity and token expiry.

**Request**:
```http
GET /api/auth/session-status
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response** (200):
```json
{
  "lastActivityAt": "2026-02-18T15:25:00Z",
  "tokenExpiresAt": "2026-02-19T15:30:00Z",
  "minutesUntilExpiry": 1435
}
```

---

## Companies Endpoints

### GET /caterings

List all catering companies. **Protected** • **Any authenticated user**

**Request**:
```http
GET /api/caterings?page=1&limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Query Parameters**:
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20, max: 100)

**Response** (200):
```json
{
  "data": [
    {
      "id": "cat-123",
      "name": "Delicias Catering",
      "email": "delicias@example.com",
      "dailyCapacity": 500,
      "status": "ACTIVE",
      "createdAt": "2026-01-01T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "pages": 3
  }
}
```

---

### GET /caterings/:id

Get catering company details.

**Request**:
```http
GET /api/caterings/cat-123
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response** (200):
```json
{
  "id": "cat-123",
  "name": "Delicias Catering",
  "email": "delicias@example.com",
  "dailyCapacity": 500,
  "status": "ACTIVE",
  "createdAt": "2026-01-01T10:00:00Z"
}
```

---

### POST /caterings

Register new catering company. **Public**

**Request**:
```http
POST /api/caterings
Content-Type: application/json

{
  "name": "Delicias Catering",
  "email": "delicias@example.com",
  "password": "secure-password",
  "dailyCapacity": 500
}
```

**Response** (201):
```json
{
  "id": "cat-123",
  "name": "Delicias Catering",
  "email": "delicias@example.com",
  "dailyCapacity": 500,
  "status": "ACTIVE",
  "createdAt": "2026-02-18T15:30:00Z"
}
```

**Errors**:
- 409 `EMAIL_ALREADY_EXISTS` - Email already registered
- 422 `WEAK_PASSWORD` - Password doesn't meet requirements

---

### PATCH /caterings/:id

Update catering company. **Protected** • **Owner only**

**Request**:
```http
PATCH /api/caterings/cat-123
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "name": "Delicias Catering Updated",
  "dailyCapacity": 600
}
```

**Response** (200):
```json
{
  "id": "cat-123",
  "name": "Delicias Catering Updated",
  "email": "delicias@example.com",
  "dailyCapacity": 600,
  "status": "ACTIVE",
  "updatedAt": "2026-02-18T15:30:00Z"
}
```

---

### GET /clients

List all client companies.

Similar to `/caterings`. Returns client company data with `workMode` (REMOTE/HYBRID/ONSITE).

---

## Users Endpoints

### GET /users

List users for authenticated company. **Protected**

**Request**:
```http
GET /api/users?page=1&limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response** (200):
```json
{
  "data": [
    {
      "id": "user-123",
      "email": "manager@catering.com",
      "role": "ADMIN",
      "isActive": true,
      "createdAt": "2026-01-01T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "pages": 1
  }
}
```

---

### GET /users/:id

Get user details. **Protected** • **Same company only**

---

### POST /users

Create new user in authenticated company. **Protected**

**Request**:
```http
POST /api/users
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "email": "newuser@catering.com",
  "password": "secure-password",
  "role": "MANAGER"
}
```

**Response** (201):
```json
{
  "id": "user-456",
  "email": "newuser@catering.com",
  "role": "MANAGER",
  "isActive": true,
  "createdAt": "2026-02-18T15:30:00Z"
}
```

---

### PATCH /users/:id

Update user. **Protected** • **Owner company only**

**Request**:
```http
PATCH /api/users/user-123
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "role": "EMPLOYEE",
  "isActive": false
}
```

**Response** (200):
```json
{
  "id": "user-123",
  "email": "manager@catering.com",
  "role": "EMPLOYEE",
  "isActive": false,
  "updatedAt": "2026-02-18T15:30:00Z"
}
```

---

### DELETE /users/:id

Delete user. **Protected** • **Owner company only**

**Request**:
```http
DELETE /api/users/user-123
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response** (204): No content

---

## Contracts Endpoints

### GET /contracts

List contracts for authenticated company. **Protected**

**Request**:
```http
GET /api/contracts?status=ACTIVE&page=1&limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Query Parameters**:
- `status` (enum, optional): Filter by status (ACTIVE, PAUSED, TERMINATED)
- `page` (number, optional): Page number
- `limit` (number, optional): Results per page

**Response** (200):
```json
{
  "data": [
    {
      "id": "contract-123",
      "cateringId": "cat-123",
      "cateringName": "Delicias Catering",
      "clientId": "cli-456",
      "clientName": "TechCorp",
      "status": "ACTIVE",
      "serviceDaysPerWeek": 5,
      "minDailyQuantity": 10,
      "defaultQuantity": 50,
      "maxQuantity": 100,
      "startDate": "2026-03-01",
      "endDate": "2026-12-31",
      "createdAt": "2026-02-18T15:30:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5, "pages": 1 }
}
```

---

### GET /contracts/:id

Get contract details. **Protected** • **Catering or Client of contract**

**Request**:
```http
GET /api/contracts/contract-123
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response** (200): Full contract details with service days summary

---

### GET /contracts/finance-metrics

Get financial metrics dashboard. **Protected** • **CLIENT only**

**Request**:
```http
GET /api/contracts/finance-metrics?contractIds=contract-123,contract-456
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response** (200):
```json
{
  "data": {
    "totalBudget": 50000,
    "totalSpent": 32500,
    "utilization": 65,
    "costPerPerson": 15.50,
    "deviation": -3.2,
    "deviationAlert": false,
    "period": {
      "start": "2026-02-01",
      "end": "2026-02-28"
    }
  }
}
```

---

### POST /contracts

Create contract. **Protected** • **CATERING only**

**Request**:
```http
POST /api/contracts
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "clientId": "cli-456",
  "serviceDays": [1, 2, 3, 4, 5],
  "minDailyQuantity": 10,
  "defaultQuantity": 50,
  "maxQuantity": 100,
  "noticeHours": 24,
  "startDate": "2026-03-01",
  "endDate": "2026-12-31"
}
```

**Response** (201):
```json
{
  "id": "contract-789",
  "status": "ACTIVE",
  "cateringId": "cat-123",
  "clientId": "cli-456",
  "createdAt": "2026-02-18T15:30:00Z"
}
```

**Errors**:
- 409 `DUPLICATE_CONTRACT` - Active contract already exists
- 422 `INVALID_DATES` - End date before start date

---

### POST /contracts/:id/pause

Pause active contract. **Protected** • **CLIENT only**

**Request**:
```http
POST /api/contracts/contract-123/pause
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response** (200):
```json
{
  "id": "contract-123",
  "status": "PAUSED",
  "pausedAt": "2026-02-18T15:30:00Z"
}
```

---

### POST /contracts/:id/resume

Resume paused contract. **Protected** • **CLIENT only**

**Request**:
```http
POST /api/contracts/contract-123/resume
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response** (200):
```json
{
  "id": "contract-123",
  "status": "ACTIVE",
  "resumedAt": "2026-02-18T15:30:00Z"
}
```

---

### POST /contracts/:id/terminate

Terminate contract permanently. **Protected** • **CLIENT only**

**Request**:
```http
POST /api/contracts/contract-123/terminate
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response** (200):
```json
{
  "id": "contract-123",
  "status": "TERMINATED",
  "terminatedAt": "2026-02-18T15:30:00Z"
}
```

---

## Service Days Endpoints

### GET /contracts/:contractId/service-days

Get service days for contract. **Protected**

**Request**:
```http
GET /api/contracts/contract-123/service-days?from=2026-02-01&to=2026-02-28
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Query Parameters**:
- `from` (date, required): ISO 8601 format
- `to` (date, required): ISO 8601 format

**Response** (200):
```json
{
  "data": [
    {
      "id": "sd-001",
      "contractId": "contract-123",
      "date": "2026-02-19",
      "dayOfWeek": "THURSDAY",
      "expectedQuantity": 50,
      "expectedQuantityConfirmedAt": "2026-02-18T10:00:00Z",
      "servedQuantity": 48,
      "servedQuantityConfirmedAt": "2026-02-19T15:00:00Z",
      "status": "CONFIRMED"
    }
  ]
}
```

---

### POST /contracts/:contractId/service-days/generate

Generate service days for upcoming period. **Protected**

**Request**:
```http
POST /api/contracts/contract-123/service-days/generate
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "days": 14
}
```

**Response** (201):
```json
{
  "created": 10,
  "skipped": 4,
  "message": "Generated 10 service days"
}
```

---

### POST /service-days/:id/confirm-expected

Confirm expected quantity. **Protected** • **CLIENT only**

**Request**:
```http
POST /api/service-days/sd-001/confirm-expected
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "expectedQuantity": 45
}
```

**Response** (200):
```json
{
  "id": "sd-001",
  "expectedQuantity": 45,
  "expectedQuantityConfirmedAt": "2026-02-18T10:00:00Z"
}
```

**Errors**:
- 422 `INVALID_QUANTITY` - Outside min/max range
- 422 `NOTICE_PERIOD_EXPIRED` - Past confirmation deadline

---

### POST /service-days/:id/confirm-served

Confirm served quantity. **Protected** • **CATERING only**

**Request**:
```http
POST /api/service-days/sd-001/confirm-served
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "servedQuantity": 48
}
```

**Response** (200):
```json
{
  "id": "sd-001",
  "servedQuantity": 48,
  "servedQuantityConfirmedAt": "2026-02-19T15:00:00Z"
}
```

---

## Reports Endpoints

### GET /contracts/:id/reports/weekly

Get weekly report. **Protected**

**Request**:
```http
GET /api/contracts/contract-123/reports/weekly?week=2026-W07
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response** (200):
```json
{
  "period": "2026-02-16 to 2026-02-22",
  "summary": {
    "totalExpected": 250,
    "totalServed": 240,
    "totalCost": 3600,
    "costPerPerson": 15
  },
  "daily": [
    {
      "date": "2026-02-16",
      "dayOfWeek": "MONDAY",
      "expected": 50,
      "served": 48,
      "cost": 720
    }
  ]
}
```

---

### GET /contracts/:id/reports/weekly/csv

Download weekly report as CSV. **Protected**

**Request**:
```http
GET /api/contracts/contract-123/reports/weekly/csv?week=2026-W07
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response** (200):
```
Content-Type: text/csv
Content-Disposition: attachment; filename="contract-123-week-07.csv"

Date,Day,Expected,Served,Cost
2026-02-16,Monday,50,48,720
2026-02-17,Tuesday,50,50,750
...
```

---

## Health Endpoints

### GET /health

Health check (no auth). **Public**

**Request**:
```http
GET /api/health
```

**Response** (200):
```json
{
  "status": "ok",
  "timestamp": "2026-02-18T15:30:00Z",
  "database": "connected",
  "uptime": 86400
}
```

---

## Seed Endpoint (Development Only)

### POST /seed

Populate database with test data. **Public** • **Dev only**

**Request**:
```http
POST /api/seed
```

**Response** (201):
```json
{
  "message": "Database seeded successfully",
  "created": {
    "caterings": 3,
    "clients": 3,
    "contracts": 5,
    "serviceDays": 150
  }
}
```

**Note**: Only available if `NODE_ENV !== 'production'`

---

## Example Workflows

### 1. Complete Login Flow

```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "catering@example.com",
    "password": "password123"
  }'

# Response:
# {
#   "token": "eyJhbGc...",
#   "refreshToken": "eyJhbGc...",
#   "company": { "id": "cat-123", "type": "CATERING" }
# }

# 2. Use token in subsequent requests
curl -X GET http://localhost:3000/api/contracts \
  -H "Authorization: Bearer eyJhbGc..."
```

### 2. Create Contract Workflow

```bash
# 1. Get available clients
curl -X GET http://localhost:3000/api/clients \
  -H "Authorization: Bearer $TOKEN"

# 2. Create contract
curl -X POST http://localhost:3000/api/contracts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "cli-456",
    "serviceDays": [1, 2, 3, 4, 5],
    "defaultQuantity": 50,
    "startDate": "2026-03-01",
    "endDate": "2026-12-31"
  }'

# 3. Generate service days
curl -X POST http://localhost:3000/api/contracts/contract-123/service-days/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "days": 7 }'
```

### 3. Service Day Confirmation Flow

```bash
# CLIENT perspective
# 1. View upcoming service days
curl -X GET "http://localhost:3000/api/contracts/contract-123/service-days?from=2026-02-19&to=2026-02-25" \
  -H "Authorization: Bearer $CLIENT_TOKEN"

# 2. Confirm expected quantity for Monday
curl -X POST http://localhost:3000/api/service-days/sd-001/confirm-expected \
  -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "expectedQuantity": 45 }'

# CATERING perspective
# 3. Confirm served quantity after service
curl -X POST http://localhost:3000/api/service-days/sd-001/confirm-served \
  -H "Authorization: Bearer $CATERING_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "servedQuantity": 43 }'
```

---

<p align="center">
  <sub>Complete API Reference for ChefOps - All endpoints, parameters, and examples</sub>
</p>
