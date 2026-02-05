import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { E2ETestHelper, loginUser, authenticatedRequest } from './e2e-helper';

/**
 * E2E Tests: Error Handling & Edge Cases
 *
 * Validates proper error responses and business rule enforcement
 */
describe('E2E: Error Handling & Edge Cases (e2e)', () => {
  let helper: E2ETestHelper;
  let cateringToken: string;

  beforeAll(async () => {
    helper = new E2ETestHelper();
    await helper.setup();

    const tokens = await loginUser(
      helper,
      'delicias@example.com',
      'password123',
    );
    cateringToken = tokens.accessToken;
  });

  afterAll(async () => {
    await helper.teardown();
  });

  describe('🔐 Authentication Errors', () => {
    it('should return 401 for missing token', async () => {
      const response = await helper.request().get('/api/contracts').expect(401);

      expect(response.body.message).toBe('Unauthorized');
    });

    it('should return 401 for malformed token', async () => {
      const response = await helper
        .request()
        .get('/api/contracts')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.statusCode).toBe(401);
    });

    it('should return 401 for expired token', async () => {
      // This would require a way to generate expired tokens
      // For now, we just test with invalid format
      const response = await helper
        .request()
        .get('/api/contracts')
        .set(
          'Authorization',
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.invalid',
        )
        .expect(401);

      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('📝 Validation Errors', () => {
    it('should return 400 for invalid email format', async () => {
      const response = await helper
        .request()
        .post('/api/auth/login')
        .send({
          email: 'not-an-email',
          password: 'password123',
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
      expect(Array.isArray(response.body.message)).toBe(true);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await helper
        .request()
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          // Missing password
        })
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 for invalid contract data', async () => {
      const response = await authenticatedRequest(helper, cateringToken)
        .post('/api/contracts')
        .send({
          clientCompanyId: 'invalid-uuid',
          serviceDaysOfWeek: [1], // Invalid: should be array of 1-7
          minDailyQuantity: 'not-a-number', // Invalid
          maxDailyQuantity: 50,
          defaultQuantity: 30,
          noticePeriodHours: 24,
          pricePerService: '100.00',
        })
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 for negative quantities', async () => {
      const response = await authenticatedRequest(helper, cateringToken)
        .post('/api/contracts')
        .send({
          clientCompanyId: '550e8400-e29b-41d4-a716-446655440001',
          serviceDaysOfWeek: [1],
          minDailyQuantity: -10, // Invalid
          maxDailyQuantity: 50,
          defaultQuantity: 30,
          noticePeriodHours: 24,
          pricePerService: '100.00',
        })
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 when minDailyQuantity > maxDailyQuantity', async () => {
      const response = await authenticatedRequest(helper, cateringToken)
        .post('/api/contracts')
        .send({
          clientCompanyId: '550e8400-e29b-41d4-a716-446655440001',
          serviceDaysOfWeek: [1],
          minDailyQuantity: 100,
          maxDailyQuantity: 50, // Less than min
          defaultQuantity: 30,
          noticePeriodHours: 24,
          pricePerService: '100.00',
        })
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('❌ Not Found Errors', () => {
    it('should return 404 for non-existent contract', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440999';

      const response = await authenticatedRequest(helper, cateringToken)
        .get(`/api/contracts/${fakeId}`)
        .expect(404);

      expect(response.body.statusCode).toBe(404);
    });

    it('should return 404 for non-existent service day', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440999';

      const response = await authenticatedRequest(helper, cateringToken)
        .post(`/api/service-days/${fakeId}/confirm-expected`)
        .send({ quantity: 20 })
        .expect(404);

      expect(response.body.statusCode).toBe(404);
    });

    it('should return 404 for non-existent endpoint', async () => {
      const response = await helper
        .request()
        .get('/api/non-existent-endpoint')
        .expect(404);

      expect(response.body.statusCode).toBe(404);
    });
  });

  describe('🚫 Business Rule Violations', () => {
    it('should prevent pausing already paused contract', async () => {
      // Create and pause a contract
      const createResponse = await authenticatedRequest(helper, cateringToken)
        .post('/api/contracts')
        .send({
          clientCompanyId: '550e8400-e29b-41d4-a716-446655440001',
          serviceDaysOfWeek: [1],
          minDailyQuantity: 10,
          maxDailyQuantity: 50,
          defaultQuantity: 30,
          noticePeriodHours: 24,
          pricePerService: '100.00',
        })
        .expect(201);

      const contractId = createResponse.body.id;

      // Pause it
      await authenticatedRequest(helper, cateringToken)
        .post(`/api/contracts/${contractId}/pause`)
        .expect(200);

      // Try to pause again
      const response = await authenticatedRequest(helper, cateringToken)
        .post(`/api/contracts/${contractId}/pause`)
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });

    it('should prevent resuming already active contract', async () => {
      // Create a contract (it starts ACTIVE)
      const createResponse = await authenticatedRequest(helper, cateringToken)
        .post('/api/contracts')
        .send({
          clientCompanyId: '550e8400-e29b-41d4-a716-446655440001',
          serviceDaysOfWeek: [1],
          minDailyQuantity: 10,
          maxDailyQuantity: 50,
          defaultQuantity: 30,
          noticePeriodHours: 24,
          pricePerService: '100.00',
        })
        .expect(201);

      const contractId = createResponse.body.id;

      // Try to resume already active contract
      const response = await authenticatedRequest(helper, cateringToken)
        .post(`/api/contracts/${contractId}/resume`)
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });

    it('should prevent resuming terminated contract', async () => {
      // Create, then terminate
      const createResponse = await authenticatedRequest(helper, cateringToken)
        .post('/api/contracts')
        .send({
          clientCompanyId: '550e8400-e29b-41d4-a716-446655440001',
          serviceDaysOfWeek: [1],
          minDailyQuantity: 10,
          maxDailyQuantity: 50,
          defaultQuantity: 30,
          noticePeriodHours: 24,
          pricePerService: '100.00',
        })
        .expect(201);

      const contractId = createResponse.body.id;

      // Terminate
      await authenticatedRequest(helper, cateringToken)
        .post(`/api/contracts/${contractId}/terminate`)
        .expect(200);

      // Try to resume
      const response = await authenticatedRequest(helper, cateringToken)
        .post(`/api/contracts/${contractId}/resume`)
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('🔒 Authorization Errors', () => {
    it('should prevent non-catering company from creating contract', async () => {
      // Login as client
      const clientTokens = await loginUser(
        helper,
        'techcorp@example.com',
        'password123',
      );

      const response = await authenticatedRequest(
        helper,
        clientTokens.accessToken,
      )
        .post('/api/contracts')
        .send({
          clientCompanyId: '550e8400-e29b-41d4-a716-446655440001',
          serviceDaysOfWeek: [1],
          minDailyQuantity: 10,
          maxDailyQuantity: 50,
          defaultQuantity: 30,
          noticePeriodHours: 24,
          pricePerService: '100.00',
        })
        .expect(403);

      expect(response.body.statusCode).toBe(403);
    });
  });
});
