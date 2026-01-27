import { getTestDb, initializeDatabase, closeTestDb } from './test-db';

export async function setup() {
  console.log('🔧 Setting up test database...');
  const db = await getTestDb();
  await initializeDatabase(db);
  console.log('✅ Test database ready');
}

export async function teardown() {
  console.log('🧹 Cleaning up test database connection...');
  await closeTestDb();
  console.log('✅ Test database connection closed');
}
