import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/shared/infrastructure/database/schema';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5435/catering_test';

let testClient: postgres.Sql | null = null;
let testDb: ReturnType<typeof drizzle> | null = null;

/**
 * Get or create test database connection
 */
export async function getTestDb() {
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
export async function closeTestDb() {
  if (testClient) {
    await testClient.end();
    testClient = null;
    testDb = null;
  }
}

/**
 * Initialize database - drop and recreate everything
 */
export async function initializeDatabase(db: ReturnType<typeof drizzle>) {
  // Drop all first for clean slate
  await db.execute(sql`DROP TABLE IF EXISTS service_days CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS contract_service_days CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS contracts CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS client_office_days CASCADE`);
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

  // Create tables
  await db.execute(sql`
    CREATE TABLE companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_type company_type NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      tax_id TEXT,
      status company_status NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(
    sql`CREATE UNIQUE INDEX ux_companies_email ON companies (email)`,
  );

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
      notice_period_hours INTEGER NOT NULL,
      status contract_status NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE contract_service_days (
      contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      dow SMALLINT NOT NULL,
      PRIMARY KEY (contract_id, dow)
    )
  `);

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
}

/**
 * Clean all tables (preserving schema)
 */
export async function cleanDatabase(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`TRUNCATE TABLE service_days CASCADE`);
  await db.execute(sql`TRUNCATE TABLE contract_service_days CASCADE`);
  await db.execute(sql`TRUNCATE TABLE contracts CASCADE`);
  await db.execute(sql`TRUNCATE TABLE client_office_days CASCADE`);
  await db.execute(sql`TRUNCATE TABLE client_profiles CASCADE`);
  await db.execute(sql`TRUNCATE TABLE catering_profiles CASCADE`);
  await db.execute(sql`TRUNCATE TABLE companies CASCADE`);
}
