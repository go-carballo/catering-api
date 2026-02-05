import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../../shared/infrastructure/database/database.module';
import type { DrizzleClient } from '../../shared/infrastructure/database/database.module';

@Injectable()
export class HealthService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleClient) {}

  async check() {
    try {
      // Simple query to verify DB connection
      await this.db.execute('SELECT 1');

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'connected',
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
