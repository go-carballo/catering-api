import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  date,
  smallint,
  uniqueIndex,
  index,
  pgEnum,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============ ENUMS ============

export const companyTypeEnum = pgEnum('company_type', ['CATERING', 'CLIENT']);
export const companyStatusEnum = pgEnum('company_status', [
  'ACTIVE',
  'INACTIVE',
]);
export const workModeEnum = pgEnum('work_mode', ['REMOTE', 'HYBRID', 'ONSITE']);
export const contractStatusEnum = pgEnum('contract_status', [
  'ACTIVE',
  'PAUSED',
  'TERMINATED',
]);
export const serviceDayStatusEnum = pgEnum('service_day_status', [
  'PENDING',
  'CONFIRMED',
]);

// ============ TABLES ============

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyType: companyTypeEnum('company_type').notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    taxId: text('tax_id'),
    status: companyStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('ux_companies_email').on(table.email),
    uniqueIndex('ux_companies_tax_id')
      .on(table.taxId)
      .where(sql`${table.taxId} IS NOT NULL`),
  ],
);

export const cateringProfiles = pgTable('catering_profiles', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id, { onDelete: 'cascade' }),
  dailyCapacity: integer('daily_capacity').notNull(),
});

export const clientProfiles = pgTable('client_profiles', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workMode: workModeEnum('work_mode').notNull().default('HYBRID'),
});

export const clientOfficeDays = pgTable(
  'client_office_days',
  {
    clientCompanyId: uuid('client_company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    dow: smallint('dow').notNull(), // 1-7 (Monday-Sunday)
  },
  (table) => [primaryKey({ columns: [table.clientCompanyId, table.dow] })],
);

export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cateringCompanyId: uuid('catering_company_id')
      .notNull()
      .references(() => companies.id),
    clientCompanyId: uuid('client_company_id')
      .notNull()
      .references(() => companies.id),

    startDate: date('start_date', { mode: 'date' }).notNull().defaultNow(),
    endDate: date('end_date', { mode: 'date' }),

    pricePerService: numeric('price_per_service', {
      precision: 12,
      scale: 2,
    }).notNull(),

    flexibleQuantity: boolean('flexible_quantity').notNull().default(true),
    minDailyQuantity: integer('min_daily_quantity').notNull(),
    maxDailyQuantity: integer('max_daily_quantity').notNull(),

    noticePeriodHours: integer('notice_period_hours').notNull(),

    status: contractStatusEnum('status').notNull().default('ACTIVE'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('ux_contract_active_pair')
      .on(table.cateringCompanyId, table.clientCompanyId)
      .where(sql`${table.status} = 'ACTIVE'`),
    index('ix_contracts_client').on(table.clientCompanyId),
    index('ix_contracts_catering').on(table.cateringCompanyId),
  ],
);

export const contractServiceDays = pgTable(
  'contract_service_days',
  {
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    dow: smallint('dow').notNull(), // 1-7 (Monday-Sunday)
  },
  (table) => [primaryKey({ columns: [table.contractId, table.dow] })],
);

export const serviceDays = pgTable(
  'service_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    serviceDate: date('service_date', { mode: 'date' }).notNull(),

    expectedQuantity: integer('expected_quantity'),
    servedQuantity: integer('served_quantity'),

    expectedConfirmedAt: timestamp('expected_confirmed_at', {
      withTimezone: true,
    }),
    servedConfirmedAt: timestamp('served_confirmed_at', { withTimezone: true }),

    status: serviceDayStatusEnum('status').notNull().default('PENDING'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('ux_service_day').on(table.contractId, table.serviceDate),
    index('ix_service_days_contract_date').on(
      table.contractId,
      table.serviceDate,
    ),
    index('ix_service_days_date').on(table.serviceDate),
    index('ix_service_days_status').on(table.contractId, table.status),
  ],
);

// ============ REFRESH TOKENS ============

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('ix_refresh_tokens_company').on(table.companyId),
    index('ix_refresh_tokens_expires').on(table.expiresAt),
    uniqueIndex('ux_refresh_token_hash').on(table.tokenHash),
  ],
);

// ============ OUTBOX (Transactional Outbox Pattern) ============

export const outboxEventStatusEnum = pgEnum('outbox_event_status', [
  'PENDING',
  'PROCESSING', // Claimed by a processor, prevents duplicate processing
  'PROCESSED',
  'FAILED', // Temporary failure, will retry with backoff
  'DEAD', // Permanent failure after max retries (poison pill)
]);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(), // e.g., 'Contract', 'ServiceDay'
    aggregateId: text('aggregate_id').notNull(), // ID of the entity that triggered the event
    payload: text('payload').notNull(), // JSON stringified event data
    status: outboxEventStatusEnum('status').notNull().default('PENDING'),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(5),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .notNull()
      .defaultNow(), // For backoff: when can we retry this event?
    processedAt: timestamp('processed_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }), // For detecting stale locks
    lockedBy: text('locked_by'), // Processor instance ID
  },
  (table) => [
    // Primary query: find events ready to process
    index('ix_outbox_pending').on(table.status, table.nextAttemptAt),
    // For monitoring/debugging
    index('ix_outbox_aggregate').on(table.aggregateType, table.aggregateId),
    // For cleanup of old processed events
    index('ix_outbox_processed_at').on(table.processedAt),
  ],
);

// ============ IDEMPOTENCY (For at-least-once delivery) ============

/**
 * Tracks which events have been processed by which handlers.
 * This enables idempotent event handling - if the same event is delivered twice,
 * the handler can check this table and skip re-processing.
 *
 * Key insight: idempotency is per (event_id, handler_name) pair.
 * The same event might be handled by multiple handlers, each tracks separately.
 */
export const processedEvents = pgTable(
  'processed_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull(), // References outbox_events.id
    handlerName: text('handler_name').notNull(), // e.g., 'EmailNotificationHandler'
    processedAt: timestamp('processed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Optional: store result/metadata for debugging
    metadata: text('metadata'),
  },
  (table) => [
    // Unique constraint: each handler processes each event only once
    uniqueIndex('ux_processed_event_handler').on(
      table.eventId,
      table.handlerName,
    ),
    // For cleanup of old records
    index('ix_processed_events_date').on(table.processedAt),
  ],
);

// ============ TYPE EXPORTS ============

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

export type ProcessedEvent = typeof processedEvents.$inferSelect;
export type NewProcessedEvent = typeof processedEvents.$inferInsert;

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type CateringProfile = typeof cateringProfiles.$inferSelect;
export type NewCateringProfile = typeof cateringProfiles.$inferInsert;

export type ClientProfile = typeof clientProfiles.$inferSelect;
export type NewClientProfile = typeof clientProfiles.$inferInsert;

export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;

export type ServiceDay = typeof serviceDays.$inferSelect;
export type NewServiceDay = typeof serviceDays.$inferInsert;
