# Security Architecture & Best Practices
## Authentication, Authorization, Threats, and Mitigations

---

## Table of Contents

1. [Security Overview](#security-overview)
2. [Authentication](#authentication)
3. [Authorization](#authorization)
4. [Input Validation & Sanitization](#input-validation--sanitization)
5. [Password Security](#password-security)
6. [JWT Security](#jwt-security)
7. [Session Management](#session-management)
8. [Data Protection](#data-protection)
9. [Threat Model & Mitigations](#threat-model--mitigations)
10. [Security Headers](#security-headers)
11. [Audit Logging](#audit-logging)

---

## Security Overview

### Security Posture

| Layer | Status | Details |
|-------|--------|---------|
| **Transport** | ✅ Protected | HTTPS only (production) |
| **Authentication** | ✅ Implemented | JWT Bearer tokens |
| **Authorization** | ⚠️ Partial | Company-level auth OK, role-based not enforced |
| **Input Validation** | ✅ Comprehensive | Zod + class-validator |
| **Password Storage** | ✅ Secure | bcrypt with cost factor 12 |
| **Session Management** | ✅ Strong | Refresh token rotation + rotation |
| **SQL Injection** | ✅ Protected | Parameterized queries (Drizzle ORM) |
| **CORS** | ✅ Configured | Restricted to frontend domain |
| **CSRF** | ✅ Protected | Implicit (SPA, no cookies) |

### Threat Level Assessment

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|-----------|
| Credential theft | Medium | High | Password reset, 2FA (future) |
| Data breach | Low | Critical | Encryption at rest, RBAC (future) |
| Unauthorized access | Low | High | JWT validation, company scoping |
| SQL injection | Very low | Critical | Parameterized queries |
| DDoS | Medium | Medium | Rate limiting (future), WAF |
| Privilege escalation | Very low | High | Role enforcement (future) |

---

## Authentication

### Authentication Method: JWT Bearer

**Why JWT?**
- Stateless (no session store needed)
- Scalable (works on multiple servers)
- Portable (can be passed to other services)
- Standard (OIDC-compatible for future federation)

**Why Not?**
- Can't revoke immediately (mitigated by short 24h expiry)
- Can't track sessions (mitigated by refresh token tracking)

### JWT Structure

**Token Format**:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJzdWIiOiJjb21wYW55LTEyMyIsImVtYWlsIjoiY2FyZXJpbmdAZXhhbXBsZS5jb20iLCJjb21wYW55VHlwZSI6IkNBVEVSSU5HIn0.
TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ
```

**Header** (Algorithm & Type):
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload** (Claims):
```json
{
  "sub": "company-123",
  "email": "catering@example.com",
  "companyType": "CATERING",
  "iat": 1708190400,
  "exp": 1708276800
}
```

**Signature** (HMAC-SHA256):
```
HMACSHA256(
  base64(header) + "." + base64(payload),
  JWT_SECRET
)
```

### Token Validation

```typescript
// 1. Extract token from Authorization header
const authHeader = request.headers['authorization'];
const token = authHeader?.replace('Bearer ', '');

// 2. Verify signature (ensures token not tampered)
const payload = jwt.verify(token, JWT_SECRET);

// 3. Check expiry
if (payload.exp * 1000 < Date.now()) {
  throw new UnauthorizedException('Token expired');
}

// 4. Extract company scope
const company = { 
  id: payload.sub, 
  type: payload.companyType 
};

// 5. All queries scoped to this company
const contracts = await getContractsByCompany(company.id);
```

### Access Token Lifetime

```typescript
// 24 hours is standard for web apps
const ACCESS_TOKEN_EXPIRY = 24 * 60 * 60; // 86,400 seconds

// Why 24h?
// - Long enough: user doesn't re-login multiple times per day
// - Short enough: stolen token has limited window
// - Refresh: app automatically gets new token when expired
```

### Token Issuance (Login)

```typescript
@Post('login')
async login(@Body() dto: LoginDto) {
  // 1. Find company by email
  const company = await this.companiesService.findByEmail(dto.email);
  if (!company) {
    // Don't reveal if email exists (timing attack)
    throw new UnauthorizedException('Invalid credentials');
  }

  // 2. Verify password (constant-time comparison)
  const passwordValid = await bcrypt.compare(
    dto.password,
    company.passwordHash
  );
  if (!passwordValid) {
    throw new UnauthorizedException('Invalid credentials');
  }

  // 3. Generate access token (short-lived)
  const accessToken = this.jwtService.sign(
    {
      sub: company.id,
      email: company.email,
      companyType: company.type,
    },
    { expiresIn: '24h' }
  );

  // 4. Generate refresh token (longer-lived)
  const refreshToken = this.generateSecureToken(32);
  const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
  
  await this.refreshTokenRepository.save({
    userId: company.id,
    tokenHash: refreshTokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  // 5. Return tokens to client
  return {
    token: accessToken,
    refreshToken: refreshToken,  // Only returned once
    tokenExpiresIn: 86400,
    company: {
      id: company.id,
      email: company.email,
      type: company.type,
    },
  };
}
```

---

## Authorization

### Company-Level Authorization

**Core Principle**: All resources scoped by company

```typescript
// Repository enforces company scope
async getContracts(companyId: string) {
  // CATERING companies see contracts they manage
  // CLIENT companies see contracts with them
  return this.db
    .select()
    .from(contracts)
    .where(
      or(
        eq(contracts.cateringId, companyId),
        eq(contracts.clientId, companyId),
      ),
    );
}
```

### Company Type Authorization

**Different Endpoints by Type**:

```typescript
// Only CATERING can create contracts
@Post('contracts')
@RequireCompanyType('CATERING')
async createContract(
  @Body() dto: CreateContractDto,
  @GetCompany() company: CompanyEntity,
) {
  // company.type === 'CATERING' guaranteed
}

// Only CLIENT can confirm expected quantities
@Post('service-days/:id/confirm-expected')
@RequireCompanyType('CLIENT')
async confirmExpectedQuantity(
  @Param('id') serviceId: string,
  @Body() dto: ConfirmDto,
  @GetCompany() company: CompanyEntity,
) {
  // company.type === 'CLIENT' guaranteed
}

// Guard implementation
@Injectable()
export class CompanyTypeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const requiredTypes = Reflect.getMetadata(
      'requireCompanyType',
      handler
    );
    
    if (!requiredTypes) return true; // No restriction

    const request = context.switchToHttp().getRequest();
    return requiredTypes.includes(request.company.type);
  }
}
```

### Resource Ownership Verification

```typescript
// Before returning contract details, verify company has access
async getContractDetail(
  contractId: string,
  companyId: string,
): Promise<ContractEntity> {
  const contract = await this.contractRepository.findById(contractId);
  
  if (!contract) {
    throw new NotFoundException();
  }

  // Authorization check
  const isAuthorized = 
    contract.cateringId === companyId || 
    contract.clientId === companyId;
  
  if (!isAuthorized) {
    // Don't reveal resource exists (no 403, just 404)
    throw new NotFoundException();
  }

  return contract;
}
```

### Future: Role-Based Access Control (RBAC)

**Foundation laid for future implementation**:

```typescript
// Roles already in database
enum UserRole {
  ADMIN = 'ADMIN',           // Full access
  MANAGER = 'MANAGER',       // Limited admin, reports
  EMPLOYEE = 'EMPLOYEE',     // Read-only operations
}

// Future JWT payload
interface JwtPayload {
  sub: string;               // Company ID
  userId: string;            // Will be added
  roles: string[];           // Will be added
  iat: number;
  exp: number;
}

// Future guard
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const requiredRoles = Reflect.getMetadata('roles', handler);
    
    if (!requiredRoles) return true;

    const request = context.switchToHttp().getRequest();
    const userRoles = request.user.roles;
    
    return requiredRoles.some(role => userRoles.includes(role));
  }
}

// Future usage
@Roles('ADMIN', 'MANAGER')
@Delete('service-days/:id')
async deleteServiceDay(
  @Param('id') id: string,
  @GetUser() user: UserEntity,
) {
  // Only ADMIN or MANAGER can delete
}
```

---

## Input Validation & Sanitization

### Defense Layers

```
Layer 1: Type validation
         ↓
Layer 2: Business logic validation
         ↓
Layer 3: Database constraints
         ↓
Layer 4: Input sanitization
```

### Layer 1: Type Validation (Zod)

```typescript
// Frontend + Backend validation
export const createContractSchema = z.object({
  clientId: z.string().uuid('Invalid client ID'),
  
  serviceDays: z
    .array(z.number().int().min(1).max(7))
    .min(1, 'At least one service day required'),
  
  minDailyQuantity: z
    .number()
    .int()
    .positive('Must be positive'),
  
  defaultQuantity: z
    .number()
    .int()
    .positive('Must be positive'),
  
  maxQuantity: z
    .number()
    .int()
    .positive('Must be positive'),
  
  startDate: z
    .string()
    .refine(val => !isNaN(Date.parse(val)), 'Invalid date')
    .transform(val => new Date(val)),
  
  endDate: z
    .string()
    .refine(val => !isNaN(Date.parse(val)), 'Invalid date')
    .transform(val => new Date(val)),
});

// Validation happens at route entry
@Post('contracts')
async create(@Body() dto: CreateContractDto) {
  // If DTO doesn't match schema, 400 response
  // No unvalidated data reaches business logic
}
```

### Layer 2: Business Logic Validation

```typescript
// Domain rules enforced after type validation
const createResult = await this.createContractUseCase.execute(dto);

if (!createResult.ok) {
  // Business error (valid data, invalid operation)
  // e.g., duplicate contract, invalid state transition
  throw new BadRequestException({
    error: createResult.code,
    message: createResult.error.message,
  });
}
```

### Layer 3: Database Constraints

```sql
-- Type enforcement at database level
CREATE TABLE contracts (
  min_daily_quantity INT NOT NULL CHECK (min_daily_quantity > 0),
  default_quantity INT NOT NULL CHECK (default_quantity > 0),
  max_quantity INT NOT NULL CHECK (max_quantity > 0),
  
  -- Semantic constraint: enforce min <= default <= max
  CONSTRAINT valid_quantity_range 
    CHECK (min_daily_quantity <= default_quantity 
           AND default_quantity <= max_quantity),
  
  -- Date range validation
  end_date DATE NOT NULL CHECK (end_date > start_date),
  
  -- Uniqueness constraint (business rule)
  UNIQUE(catering_id, client_id) 
    WHERE status = 'ACTIVE' AND deleted_at IS NULL
);
```

### Layer 4: Input Sanitization

```typescript
// Email trimming & normalization
const email = dto.email.trim().toLowerCase();

// String length limits (prevent DoS)
if (dto.name.length > 255) {
  throw new BadRequestException('Name too long');
}

// HTML escaping (if rendering user input)
const safeName = escapeHtml(dto.name);

// No string concatenation in queries (parameterized instead)
// WRONG: `SELECT * FROM companies WHERE email = '${email}'`
// RIGHT: db.select().from(companies).where(eq(companies.email, email))
```

### SQL Injection Prevention

```typescript
// Drizzle ORM uses parameterized queries
// Parameters separated from SQL

// ✅ SAFE (parameterized)
const contract = await this.db
  .select()
  .from(contracts)
  .where(eq(contracts.id, contractId));
// Generates: SELECT * FROM contracts WHERE id = $1
// Parameter: contractId sent separately

// ❌ UNSAFE (string concatenation)
const contract = await this.db
  .select()
  .from(contracts)
  .where(sql`WHERE id = ${contractId}`);
// If contractId = "123'; DROP TABLE contracts; --"
// Could execute: DELETE FROM contracts
```

**Protection**: Never concatenate SQL strings, always use parameterized queries

---

## Password Security

### Password Requirements

```typescript
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine(
    pass => /[A-Z]/.test(pass),
    'Must contain uppercase letter'
  )
  .refine(
    pass => /[a-z]/.test(pass),
    'Must contain lowercase letter'
  )
  .refine(
    pass => /[0-9]/.test(pass),
    'Must contain number'
  );

// Examples
// ✅ 'SecurePass123'
// ❌ 'password' (no uppercase, no number)
// ❌ 'Pass1' (too short)
```

### Password Hashing (bcrypt)

```typescript
// Hashing
const passwordHash = await bcrypt.hash(password, 12);
// Cost factor 12: ~270ms per hash
// Slows down brute-force attacks

// Verification (constant-time comparison)
const match = await bcrypt.compare(inputPassword, storedHash);
// bcrypt.compare takes same time regardless of match
// Prevents timing attacks that reveal password length
```

### Password Reset Flow

```typescript
// 1. User requests reset
@Post('forgot-password')
async forgotPassword(@Body('email') email: string) {
  const company = await this.companiesService.findByEmail(email);
  
  if (company) {
    // Only send email if company exists
    // But don't reveal in response (security)
    const token = await this.createPasswordResetToken(email);
    await this.emailService.sendPasswordReset(email, token);
  }
  
  // Always return same response (don't reveal if email exists)
  return { message: 'If email exists, reset link sent' };
}

// 2. User clicks link, enters new password
@Post('reset-password')
async resetPassword(
  @Body() dto: ResetPasswordDto
) {
  // dto.token (from email link)
  // dto.newPassword (from form)
  
  const record = await this.passwordResetTokenRepository
    .findByToken(dto.token);
  
  // Verify token exists and not expired
  if (!record || record.expiresAt < new Date()) {
    throw new BadRequestException('Invalid or expired token');
  }
  
  // Hash new password
  const newHash = await bcrypt.hash(dto.newPassword, 12);
  
  // Update password & invalidate all refresh tokens
  await this.companiesService.updatePassword(
    record.email,
    newHash
  );
  
  // Mark token as used (can't reuse)
  record.usedAt = new Date();
  await this.passwordResetTokenRepository.save(record);
  
  return { message: 'Password reset successfully' };
}
```

### Password Reset Token

```typescript
// Generate random token
function generateSecureToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// Example token: a8f3e2b1c9d4f7a1e6c3b8f2d5a9c1e8

// Store hash of token (not plaintext)
const tokenHash = await bcrypt.hash(token, 12);

// Token expires in 15 minutes
const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

// Send only plaintext token in email
// User clicks: https://app.com/reset-password?token=a8f3e2b1c9...
// Only hash stored in database
```

---

## JWT Security

### JWT Best Practices

```typescript
// ✅ 1. Use HTTPS only (transport security)
const token = jwt.sign(payload, SECRET, {
  algorithm: 'HS256',  // HMAC-SHA256
  expiresIn: '24h',    // Short expiry
  issuer: 'https://api.chefops.com',  // Validate issuer
  audience: 'chefops-frontend',  // Validate audience
});

// ✅ 2. Short expiry (24 hours)
// Compromised token has limited window

// ✅ 3. Refresh token rotation
// Exchange refresh token for new access token
// If old refresh token used after rotation: revoke all tokens

// ✅ 4. Store sensitive data elsewhere
// DON'T PUT IN JWT: passwords, credit card, social security
// JWT is visible to client (just not forgeable)

// ❌ WRONG: Storing password in JWT
jwt.sign({
  sub: 'user-123',
  password: passwordHash,  // NO!
});

// ✅ RIGHT: Only identity info
jwt.sign({
  sub: 'company-123',  // ID only
  email: 'catering@example.com',
  companyType: 'CATERING',
});
```

### Token Extraction

```typescript
// From Authorization header
const authHeader = request.headers['authorization'];
if (!authHeader?.startsWith('Bearer ')) {
  throw new UnauthorizedException('Missing token');
}

const token = authHeader.substring(7);  // Remove 'Bearer '

// Validate format (must be valid JWT)
try {
  const payload = jwt.verify(token, JWT_SECRET);
  // Success
} catch (error) {
  throw new UnauthorizedException('Invalid token');
}
```

---

## Session Management

### Refresh Token Rotation

**Pattern**: Old token invalidated when new token issued

```typescript
// Client flow
1. Login → get token + refreshToken
2. Store both in localStorage
3. Every request: use token in Authorization header
4. When token expires (401 response):
   - Send refreshToken to POST /auth/refresh
   - Receive new token + new refreshToken
   - Both old tokens become invalid

// Server flow
@Post('refresh')
async refreshToken(@Body('refreshToken') refreshToken: string) {
  // 1. Find token in database
  const record = await this.db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, bcrypt.hash(refreshToken)),
        gt(refreshTokens.expiresAt, new Date()),
        isNull(refreshTokens.revokedAt),
      ),
    )
    .limit(1);

  if (!record) {
    throw new UnauthorizedException('Invalid refresh token');
  }

  // 2. Generate new access token
  const newAccessToken = jwt.sign(
    {
      sub: record.userId,
      // ... other claims
    },
    { expiresIn: '24h' },
  );

  // 3. Generate new refresh token
  const newRefreshToken = generateSecureToken(32);
  const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 12);

  // 4. Save new refresh token
  await this.db.insert(refreshTokens).values({
    userId: record.userId,
    tokenHash: newRefreshTokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  // 5. Invalidate old refresh token (optional, for security)
  await this.db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, record.id));

  return {
    token: newAccessToken,
    refreshToken: newRefreshToken,
  };
}
```

### Token Revocation

```typescript
// When user logs out
@Post('logout')
async logout(
  @Body('refreshToken') refreshToken: string,
  @GetCompany() company: CompanyEntity,
) {
  // Mark token as revoked
  await this.db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.tokenHash, bcrypt.hash(refreshToken)),
        eq(refreshTokens.userId, company.id),
      ),
    );

  return { message: 'Logged out successfully' };
}

// When user changes password (revoke all sessions)
@Post('change-password')
async changePassword(
  @Body() dto: ChangePasswordDto,
  @GetCompany() company: CompanyEntity,
) {
  // ... validate old password, hash new password ...
  
  // Revoke all refresh tokens (forces re-login everywhere)
  await this.db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.userId, company.id));

  return { message: 'Password changed. Please login again' };
}
```

---

## Data Protection

### Encryption in Transit

```typescript
// Development: HTTP allowed (local testing)
// Production: HTTPS enforced

// Railway + Vercel provide free SSL certificates
// All traffic encrypted with TLS 1.3
```

### Encryption at Rest

```typescript
// Passwords: bcrypt hashing (one-way, can't decrypt)
// Tokens: bcrypt hashing (same)
// PII (emails): plaintext in database
//   - If database breached: emails exposed
//   - Mitigation: Don't store unnecessary PII
//   - Future: encrypt sensitive fields in application

// Secrets management
// JWT_SECRET: 256-bit random value
// Stored in environment variables (not in code)
// Different per environment
```

### Sensitive Data Handling

```typescript
// What we store
- Company email (needed for login)
- Password hash (needed for auth)
- Service day quantities (business data)
- User roles (needed for auth)

// What we DON'T store
- Password plaintext
- JWT tokens in database
- Credit cards
- Personal employee info

// Soft deletes (don't hard delete)
DELETE logically with deleted_at timestamp
- Allows data recovery
- Preserves audit trail
- Can be hard-deleted later (e.g., GDPR request)
```

---

## Threat Model & Mitigations

### Threat 1: Credential Theft

**Attack**: Attacker obtains password

**Likelihood**: Medium (phishing, malware)
**Impact**: Full company access

**Mitigations**:
- ✅ Password hashing with bcrypt
- ✅ Password requirements (8+ chars, uppercase, number)
- ⚠️ No 2FA (future enhancement)
- ⚠️ No email verification (future)
- ✅ Password reset flow available

**Detection**: Password reset emails sent without user request

---

### Threat 2: Token Theft

**Attack**: Attacker obtains JWT token

**Likelihood**: Low (if HTTPS enforced)
**Impact**: Can impersonate company until token expires

**Mitigations**:
- ✅ HTTPS only (encryption in transit)
- ✅ 24-hour expiry (limited window)
- ✅ Refresh token rotation
- ✅ Tokens not logged (no accidental exposure)
- ⚠️ No HttpOnly cookies (SPA architecture uses localStorage)

**Note**: localStorage isn't HSM, but acceptable for modern web apps

---

### Threat 3: Session Hijacking

**Attack**: Attacker uses stolen session to access data

**Likelihood**: Very Low (company-scoped auth)
**Impact**: High (company data access)

**Mitigations**:
- ✅ All queries company-scoped (even with valid token)
- ✅ Resource ownership verification (not just auth)
- ✅ Can revoke all sessions (password change)

**Example**:
```typescript
// Even if token stolen, attacker only sees company's own data
GET /api/contracts
  Authorization: Bearer [stolen-token]
  
Returns: Only contracts involving this company
  (can't leak other companies' contracts)
```

---

### Threat 4: SQL Injection

**Attack**: Attacker injects SQL via input fields

**Likelihood**: Very Low
**Impact**: Critical (database compromise)

**Mitigations**:
- ✅ Parameterized queries (Drizzle ORM)
- ✅ Input validation (Zod)
- ✅ Type safety (TypeScript)
- ✅ Database constraints

**Example**:
```typescript
// SAFE: parameter separate from SQL
const company = await this.db
  .select()
  .from(companies)
  .where(eq(companies.email, userInput));

// Even if userInput = "'; DROP TABLE companies; --"
// Parameter is escaped, not executed
```

---

### Threat 5: CSRF (Cross-Site Request Forgery)

**Attack**: Attacker tricks user into calling API

**Likelihood**: Very Low
**Impact**: Medium (action on user's behalf)

**Mitigation**: ✅ SPA architecture (no cookies)
- SPAs don't use cookies (use Bearer tokens instead)
- Tokens in Authorization header (not sent with cross-origin requests)
- CORS restricts which origins can call API

```typescript
// CORS configuration
app.enableCors({
  origin: process.env.FRONTEND_URL,  // https://chefops.vercel.app
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Only chefops.vercel.app can call API
// Attacker's site can't send requests with valid token
```

---

### Threat 6: Brute Force (Password Guessing)

**Attack**: Attacker tries many passwords

**Likelihood**: Medium
**Impact**: Account compromise

**Mitigations**:
- ✅ bcrypt cost factor 12 (slows hashing)
- ⚠️ No rate limiting on login endpoint (future)
- ⚠️ No account lockout (future)

**Future Enhancement**:
```typescript
// Rate limiting per email
@UseGuards(RateLimitGuard)
@Post('login')
async login(@Body() dto: LoginDto) {
  // Max 5 attempts per 15 minutes per email
  // After 5 failures: locked for 15 minutes
}
```

---

### Threat 7: DDoS (Denial of Service)

**Attack**: Attacker sends many requests to overwhelm server

**Likelihood**: Medium
**Impact**: Service unavailability

**Mitigations**:
- ⚠️ No application-level rate limiting (future)
- ✅ Railway infrastructure includes DDoS protection
- ✅ Vercel CDN handles traffic spikes
- ✅ Database connection pooling

**Future Enhancement**:
```typescript
// Rate limiting middleware
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,  // 100 requests per window per IP
  message: 'Too many requests, try again later',
}));
```

---

### Threat 8: Data Exfiltration

**Attack**: Attacker with company access exports all data

**Likelihood**: Medium (if company compromised)
**Impact**: Critical (data breach)

**Mitigations**:
- ⚠️ No field-level encryption (all data readable to authenticated company)
- ⚠️ No audit logging (future)
- ✅ Company scope prevents cross-tenant leakage

**Future Enhancements**:
1. **Audit logging**: Track who accessed what, when
2. **Field encryption**: Encrypt sensitive fields (quantities, financial data)
3. **Access alerts**: Email if unusual access pattern detected
4. **Data masking**: Hide PII from certain roles

---

## Security Headers

### HTTP Security Headers

```typescript
// NestJS middleware
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection (legacy, deprecated)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'",
  );
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy
  res.setHeader('Permissions-Policy', 'geolocation=()');
  
  next();
});
```

---

## Audit Logging

### What We Log

```typescript
// Events logged (with timestamp, actor, action, resource)
- Login attempt (success/failure)
- Password change
- Token refresh
- Contract creation/modification
- Service day confirmation
- Failed authorization (access denied)
```

**Example**:
```typescript
await this.auditLog.log({
  timestamp: new Date(),
  actor: company.id,
  action: 'CONTRACT_CREATED',
  resource: 'contracts',
  resourceId: contract.id,
  changes: { status: 'ACTIVE' },
  ipAddress: request.ip,
});
```

### What We Don't Log

```
- Passwords (never, at any point)
- JWT tokens (if leaked in logs, could impersonate user)
- Full request/response bodies (PII exposure)
```

### Log Storage

```typescript
// Logs sent to:
// 1. Console (development)
// 2. File system (production, rotated daily)
// 3. Future: centralized log aggregation (ELK, Datadog, etc.)

// Retention: 30 days
// After: archive to cold storage or delete
```

---

## Security Checklist

### Before Production Deployment

- [ ] JWT_SECRET is strong (256-bit random)
- [ ] HTTPS enforced (no HTTP traffic)
- [ ] CORS configured (only trusted origins)
- [ ] Password requirements enforced
- [ ] Password reset working
- [ ] Token expiry: 24 hours
- [ ] Refresh tokens: 7 days (30 with remember-me)
- [ ] All queries parameterized (no SQL injection possible)
- [ ] Input validation on all endpoints
- [ ] Company scope on all queries
- [ ] Error messages don't leak sensitive info
- [ ] Database backups automated
- [ ] Secrets not in code (.env files excluded from git)
- [ ] OWASP dependencies audit passed

### Regular Security Audits

- [ ] Monthly: Dependency vulnerability check (`npm audit`)
- [ ] Quarterly: Manual security review
- [ ] Annually: Third-party penetration test (for Master's thesis)

---

<p align="center">
  <sub>Security Architecture for ChefOps - Authentication, Authorization, Threats, and Defenses</sub>
</p>
