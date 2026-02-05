import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../src/shared/infrastructure/database/schema';
import * as bcrypt from 'bcrypt';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5435/catering_test';

let testClient: postgres.Sql | null = null;
let testDb: ReturnType<typeof drizzle> | null = null;

/**
 * Get or create test database connection
 */
async function getTestDb() {
  if (!testDb) {
    testClient = postgres(TEST_DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    testDb = drizzle(testClient, { schema });
  }
  return testDb;
}

/**
 * Close test database connection
 */
async function closeTestDb() {
  if (testClient) {
    await testClient.end();
    testClient = null;
    testDb = null;
  }
}

/**
 * Recreate database schema
 */
async function initializeDatabase(db: ReturnType<typeof drizzle>) {
  // Drop all tables
  await db.execute(sql`DROP TABLE IF EXISTS outbox_events CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS service_days CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS contracts CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS client_office_days CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS session_activities CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS client_profiles CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS catering_profiles CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS companies CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS service_day_status CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS contract_status CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS work_mode CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS company_status CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS company_type CASCADE`);

  // Create enums
  await db.execute(
    sql`CREATE TYPE company_type AS ENUM ('CATERING', 'CLIENT')`,
  );
  await db.execute(
    sql`CREATE TYPE company_status AS ENUM ('ACTIVE', 'INACTIVE')`,
  );
  await db.execute(
    sql`CREATE TYPE work_mode AS ENUM ('REMOTE', 'HYBRID', 'ONSITE')`,
  );
  await db.execute(
    sql`CREATE TYPE contract_status AS ENUM ('ACTIVE', 'PAUSED', 'TERMINATED')`,
  );
  await db.execute(
    sql`CREATE TYPE service_day_status AS ENUM ('PENDING', 'CONFIRMED')`,
  );

  // Create companies table
  await db.execute(sql`
    CREATE TABLE companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_type company_type NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      tax_id TEXT,
      status company_status NOT NULL DEFAULT 'ACTIVE',
      last_activity_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Create profiles
  await db.execute(sql`
    CREATE TABLE catering_profiles (
      company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      daily_capacity INTEGER NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE client_profiles (
      company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      work_mode work_mode NOT NULL DEFAULT 'HYBRID'
    )
  `);

  await db.execute(sql`
    CREATE TABLE client_office_days (
      client_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      dow SMALLINT NOT NULL,
      PRIMARY KEY (client_company_id, dow)
    )
  `);

  // Create contracts
  await db.execute(sql`
    CREATE TABLE contracts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      catering_company_id UUID NOT NULL REFERENCES companies(id),
      client_company_id UUID NOT NULL REFERENCES companies(id),
      start_date DATE NOT NULL DEFAULT CURRENT_DATE,
      end_date DATE,
      price_per_service NUMERIC(12, 2) NOT NULL,
      flexible_quantity BOOLEAN NOT NULL DEFAULT TRUE,
      min_daily_quantity INTEGER NOT NULL,
      max_daily_quantity INTEGER NOT NULL,
      default_quantity INTEGER,
      notice_period_hours INTEGER NOT NULL,
      status contract_status NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE contracts_service_days (
      contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      dow SMALLINT NOT NULL,
      PRIMARY KEY (contract_id, dow)
    )
  `);

  // Create service days
  await db.execute(sql`
    CREATE TABLE service_days (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      service_date DATE NOT NULL,
      expected_quantity INTEGER,
      served_quantity INTEGER,
      expected_confirmed_at TIMESTAMPTZ,
      served_confirmed_at TIMESTAMPTZ,
      status service_day_status NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(
    sql`CREATE UNIQUE INDEX ux_service_day ON service_days (contract_id, service_date)`,
  );

  // Create session activities table
  await db.execute(sql`
    CREATE TABLE session_activities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Create outbox for events
  await db.execute(sql`
    CREATE TABLE outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      aggregate_id TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      processed BOOLEAN NOT NULL DEFAULT FALSE,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Seed test data
 */
async function seedTestData(db: ReturnType<typeof drizzle>) {
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash('password123', saltRounds);

  // Create catering company
  const cateringId = '550e8400-e29b-41d4-a716-446655440000';
  await db.execute(sql`
    INSERT INTO companies (id, company_type, name, email, password_hash, tax_id, status)
    VALUES (
      ${cateringId},
      'CATERING',
      'Delicias Catering',
      'delicias@example.com',
      ${passwordHash},
      'TAX123456',
      'ACTIVE'
    )
  `);

  await db.execute(sql`
    INSERT INTO catering_profiles (company_id, daily_capacity)
    VALUES (${cateringId}, 1000)
  `);

  // Create client company
  const clientId = '550e8400-e29b-41d4-a716-446655440001';
  await db.execute(sql`
    INSERT INTO companies (id, company_type, name, email, password_hash, tax_id, status)
    VALUES (
      ${clientId},
      'CLIENT',
      'TechCorp',
      'techcorp@example.com',
      ${passwordHash},
      'TAX789012',
      'ACTIVE'
    )
  `);

  await db.execute(sql`
    INSERT INTO client_profiles (company_id, work_mode)
    VALUES (${clientId}, 'HYBRID')
  `);

  // Add office days for client
  for (let i = 1; i <= 5; i++) {
    await db.execute(sql`
      INSERT INTO client_office_days (client_company_id, dow)
      VALUES (${clientId}, ${i})
    `);
  }
}

/**
 * Global setup for E2E tests
 */
export async function setup() {
  // Set test database URL for NestJS AppModule
  process.env.DATABASE_URL = TEST_DATABASE_URL;

  console.log('🔧 Setting up E2E test database...');
  const db = await getTestDb();
  await initializeDatabase(db);
  await seedTestData(db);
  await closeTestDb();
  console.log('✅ E2E test database ready with seed data');
}

/**
 * Global teardown for E2E tests
 */
export async function teardown() {
  console.log('🧹 Cleaning up E2E test database...');
  await closeTestDb();
  console.log('✅ E2E test cleanup complete');
}
