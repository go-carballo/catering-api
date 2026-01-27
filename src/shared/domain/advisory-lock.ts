import { sql } from 'drizzle-orm';
import type { DrizzleClient } from '../infrastructure/database/drizzle.client';

/**
 * PostgreSQL Advisory Lock utility for distributed locking.
 *
 * Advisory locks are ideal for preventing concurrent execution of scheduled jobs
 * across multiple server instances. They are:
 * - Session-based (released when connection closes)
 * - Non-blocking (pg_try_advisory_lock returns immediately)
 * - Lightweight (no table rows, just in-memory)
 *
 * Lock ID strategy:
 * We use a hash of the job name to generate a unique 64-bit integer.
 * PostgreSQL advisory locks require a bigint key.
 */

/**
 * Well-known lock IDs for scheduler jobs.
 * Using fixed IDs ensures consistency across deployments.
 *
 * IDs are chosen to be unique and not conflict with application data.
 * Range: 100000+ reserved for scheduler jobs.
 */
export const LOCK_IDS = {
  GENERATE_SERVICE_DAYS: 100001,
  APPLY_FALLBACK: 100002,
} as const;

export type LockId = (typeof LOCK_IDS)[keyof typeof LOCK_IDS];

/**
 * Try to acquire an advisory lock. Returns immediately.
 *
 * @param db - Drizzle database client
 * @param lockId - Unique lock identifier
 * @returns true if lock acquired, false if already held by another session
 */
export async function tryAcquireLock(
  db: DrizzleClient,
  lockId: LockId,
): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT pg_try_advisory_lock(${lockId}) as acquired`,
  );

  // Result is an array-like object with the row data
  const row = result[0] as { acquired: boolean } | undefined;
  return row?.acquired === true;
}

/**
 * Release an advisory lock.
 *
 * @param db - Drizzle database client
 * @param lockId - Unique lock identifier
 * @returns true if lock was released, false if not held
 */
export async function releaseLock(
  db: DrizzleClient,
  lockId: LockId,
): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT pg_advisory_unlock(${lockId}) as released`,
  );

  const row = result[0] as { released: boolean } | undefined;
  return row?.released === true;
}

/**
 * Execute a function with an advisory lock.
 * Automatically releases the lock when done.
 *
 * @param db - Drizzle database client
 * @param lockId - Unique lock identifier
 * @param fn - Function to execute while holding the lock
 * @returns Result of fn, or null if lock could not be acquired
 */
export async function withAdvisoryLock<T>(
  db: DrizzleClient,
  lockId: LockId,
  fn: () => Promise<T>,
): Promise<{ acquired: true; result: T } | { acquired: false; result: null }> {
  const acquired = await tryAcquireLock(db, lockId);

  if (!acquired) {
    return { acquired: false, result: null };
  }

  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    await releaseLock(db, lockId);
  }
}
