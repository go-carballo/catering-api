import { vi } from 'vitest';

/**
 * Creates a chainable mock for Drizzle ORM queries.
 * Each method returns `this` to allow chaining, except terminal methods.
 */
export function createDrizzleMock() {
  const mock: any = {
    _results: [] as any[],

    // Set the result that will be returned by terminal methods
    setResult(results: any[]) {
      mock._results = results;
      return mock;
    },

    // Query building methods (chainable)
    select: vi.fn(() => mock),
    from: vi.fn(() => mock),
    innerJoin: vi.fn(() => mock),
    leftJoin: vi.fn(() => mock),
    where: vi.fn(() => mock),
    orderBy: vi.fn(() => mock),
    groupBy: vi.fn(() => mock),
    having: vi.fn(() => mock),
    limit: vi.fn(() => Promise.resolve(mock._results)),
    offset: vi.fn(() => mock),

    // Insert/Update/Delete
    insert: vi.fn(() => mock),
    update: vi.fn(() => mock),
    delete: vi.fn(() => mock),
    values: vi.fn(() => mock),
    set: vi.fn(() => mock),
    returning: vi.fn(() => Promise.resolve(mock._results)),

    // Transaction
    transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => {
      const tx = createDrizzleMock();
      return callback(tx);
    }),

    // Make the mock itself a promise for queries that don't use .limit()
    then: vi.fn((resolve: (value: any) => void) => resolve(mock._results)),
  };

  return mock;
}

/**
 * Resets all mock functions and clears results.
 */
export function resetDrizzleMock(mock: ReturnType<typeof createDrizzleMock>) {
  mock._results = [];
  Object.keys(mock).forEach((key) => {
    if (typeof mock[key]?.mockClear === 'function') {
      mock[key].mockClear();
    }
  });
}
