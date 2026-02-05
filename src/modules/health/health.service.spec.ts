import { describe, it, expect, vi } from 'vitest';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('should return ok status when database is connected', async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const healthService = new HealthService(mockDb as any);

    const result = await healthService.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
    expect(result.timestamp).toBeDefined();
  });

  it('should return error status when database connection fails', async () => {
    const mockDb = {
      execute: vi.fn().mockRejectedValue(new Error('Connection failed')),
    };
    const healthService = new HealthService(mockDb as any);

    const result = await healthService.check();

    expect(result.status).toBe('error');
    expect(result.database).toBe('disconnected');
    expect(result.error).toContain('Connection failed');
    expect(result.timestamp).toBeDefined();
  });
});
