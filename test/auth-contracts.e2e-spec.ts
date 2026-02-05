import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { E2ETestHelper, loginUser, authenticatedRequest } from './e2e-helper';

/**
 * E2E Tests: Authentication & Contract Management
 *
 * This test suite validates the complete flow:
 * 1. Login with valid credentials
 * 2. Create a contract
 * 3. Pause/Resume/Terminate contract
 * 4. Generate service days
 * 5. Confirm service day quantities
 */
describe('E2E: Authentication & Contracts (e2e)', () => {
  let helper: E2ETestHelper;
  let cateringToken: string;
  let clientToken: string;
  let contractId: string;
  let serviceDayId: string;

  beforeAll(async () => {
    helper = new E2ETestHelper();
    await helper.setup();
  });

  afterAll(async () => {
    await helper.teardown();
  });

  describe('🔐 Authentication', () => {
    it('should login with valid catering credentials', async () => {
      const response = await helper
        .request()
        .post('/api/auth/login')
        .send({
          email: 'delicias@example.com',
          password: 'password123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.accessToken).toBeTruthy();

      cateringToken = response.body.accessToken;
    });

    it('should login with valid client credentials', async () => {
      const response = await helper
        .request()
        .post('/api/auth/login')
        .send({
          email: 'techcorp@example.com',
          password: 'password123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      clientToken = response.body.accessToken;
    });

    it('should fail with invalid email', async () => {
      await helper
        .request()
        .post('/api/auth/login')
        .send({
          email: 'invalid@example.com',
          password: 'password123',
        })
        .expect(401);
    });

    it('should fail with invalid password', async () => {
      await helper
        .request()
        .post('/api/auth/login')
        .send({
          email: 'delicias@example.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('should fail without token on protected endpoint', async () => {
      await helper.request().get('/api/contracts').expect(401);
    });

    it('should get session status when authenticated', async () => {
      const response = await authenticatedRequest(helper, cateringToken)
        .get('/api/auth/session-status')
        .expect(200);

      expect(response.body).toHaveProperty('companyId');
      expect(response.body).toHaveProperty('email');
      expect(response.body.email).toBe('delicias@example.com');
    });
  });

  describe('📝 Contract Management', () => {
    it('should list contracts when authenticated', async () => {
      const response = await authenticatedRequest(helper, cateringToken)
        .get('/api/contracts')
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should create a contract (catering creates with client)', async () => {
      const response = await authenticatedRequest(helper, cateringToken)
        .post('/api/contracts')
        .send({
          clientCompanyId: '550e8400-e29b-41d4-a716-446655440001', // From seed
          serviceDaysOfWeek: [1, 3, 5], // Mon, Wed, Fri
          minDailyQuantity: 10,
          maxDailyQuantity: 50,
          defaultQuantity: 30,
          noticePeriodHours: 24,
          pricePerService: '100.00',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.minDailyQuantity).toBe(10);
      expect(response.body.maxDailyQuantity).toBe(50);

      contractId = response.body.id;
    });

    it('should get contract by ID', async () => {
      const response = await authenticatedRequest(helper, cateringToken)
        .get(`/api/contracts/${contractId}`)
        .expect(200);

      expect(response.body.id).toBe(contractId);
      expect(response.body.status).toBe('ACTIVE');
    });

    it('should fail to create contract with invalid data', async () => {
      await authenticatedRequest(helper, cateringToken)
        .post('/api/contracts')
        .send({
          clientCompanyId: 'invalid-id',
          serviceDaysOfWeek: [1],
          // Missing required fields
        })
        .expect(400);
    });

    it('should pause active contract', async () => {
      const response = await authenticatedRequest(helper, cateringToken)
        .post(`/api/contracts/${contractId}/pause`)
        .expect(200);

      expect(response.body.status).toBe('PAUSED');
    });

    it('should resume paused contract', async () => {
      const response = await authenticatedRequest(helper, cateringToken)
        .post(`/api/contracts/${contractId}/resume`)
        .expect(200);

      expect(response.body.status).toBe('ACTIVE');
    });

    it('should terminate active contract', async () => {
      // Create a new contract to terminate
      const createResponse = await authenticatedRequest(helper, cateringToken)
        .post('/api/contracts')
        .send({
          clientCompanyId: '550e8400-e29b-41d4-a716-446655440001',
          serviceDaysOfWeek: [2, 4], // Tue, Thu
          minDailyQuantity: 15,
          maxDailyQuantity: 40,
          defaultQuantity: 25,
          noticePeriodHours: 48,
          pricePerService: '150.00',
        })
        .expect(201);

      const newContractId = createResponse.body.id;

      const terminateResponse = await authenticatedRequest(
        helper,
        cateringToken,
      )
        .post(`/api/contracts/${newContractId}/terminate`)
        .expect(200);

      expect(terminateResponse.body.status).toBe('TERMINATED');
    });

    it('should not allow pausing non-active contract', async () => {
      // Contract is already ACTIVE but let's verify error on wrong status
      // First terminate it
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

      const testContractId = createResponse.body.id;

      // Terminate it
      await authenticatedRequest(helper, cateringToken)
        .post(`/api/contracts/${testContractId}/terminate`)
        .expect(200);

      // Try to pause terminated contract (should fail)
      await authenticatedRequest(helper, cateringToken)
        .post(`/api/contracts/${testContractId}/pause`)
        .expect(400);
    });
  });

  describe('📅 Service Days', () => {
    it('should generate service days for contract', async () => {
      const response = await authenticatedRequest(helper, cateringToken)
        .post(`/api/contracts/${contractId}/service-days/generate`)
        .send({})
        .expect(201);

      expect(response.body).toHaveProperty('generated');
      expect(response.body.generated).toBeGreaterThanOrEqual(0);
    });

    it('should get service days for contract', async () => {
      const response = await authenticatedRequest(helper, cateringToken)
        .get(`/api/contracts/${contractId}/service-days`)
        .query({
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
        })
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);

      if (response.body.data.length > 0) {
        serviceDayId = response.body.data[0].id;
        expect(response.body.data[0]).toHaveProperty('expectedQuantity');
        expect(response.body.data[0]).toHaveProperty('status');
      }
    });

    it('should confirm expected quantity', async () => {
      if (!serviceDayId) {
        // Generate first
        const generateResponse = await authenticatedRequest(
          helper,
          cateringToken,
        )
          .post(`/api/contracts/${contractId}/service-days/generate`)
          .send({})
          .expect(201);

        if (generateResponse.body.generated > 0) {
          const listResponse = await authenticatedRequest(helper, cateringToken)
            .get(`/api/contracts/${contractId}/service-days`)
            .query({
              startDate: new Date().toISOString().split('T')[0],
              endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0],
            })
            .expect(200);

          if (listResponse.body.data.length > 0) {
            serviceDayId = listResponse.body.data[0].id;
          }
        }
      }

      if (serviceDayId) {
        const response = await authenticatedRequest(helper, clientToken)
          .post(`/api/service-days/${serviceDayId}/confirm-expected`)
          .send({
            quantity: 25,
          })
          .expect(200);

        expect(response.body.expectedQuantity).toBe(25);
      }
    });

    it('should confirm served quantity', async () => {
      if (serviceDayId) {
        const response = await authenticatedRequest(helper, cateringToken)
          .post(`/api/service-days/${serviceDayId}/confirm-served`)
          .send({
            quantity: 25,
          })
          .expect(200);

        expect(response.body.servedQuantity).toBe(25);
        expect(response.body.status).toBe('CONFIRMED');
      }
    });

    it('should not allow confirming with quantity outside min/max', async () => {
      // Generate a new service day
      const generateResponse = await authenticatedRequest(helper, cateringToken)
        .post(`/api/contracts/${contractId}/service-days/generate`)
        .send({})
        .expect(201);

      if (generateResponse.body.generated > 0) {
        const listResponse = await authenticatedRequest(helper, cateringToken)
          .get(`/api/contracts/${contractId}/service-days`)
          .query({
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
          })
          .expect(200);

        const newServiceDay = listResponse.body.data.find(
          (sd: any) => sd.id !== serviceDayId,
        );

        if (newServiceDay) {
          // Try to confirm with quantity > max (50)
          await authenticatedRequest(helper, clientToken)
            .post(`/api/service-days/${newServiceDay.id}/confirm-expected`)
            .send({
              quantity: 100, // Exceeds maxDailyQuantity of 50
            })
            .expect(400);
        }
      }
    });
  });

  describe('📊 Reports', () => {
    it('should get weekly report', async () => {
      const response = await authenticatedRequest(helper, cateringToken)
        .get(`/api/contracts/${contractId}/reports/weekly`)
        .query({
          weekStart: new Date().toISOString().split('T')[0],
        })
        .expect(200);

      expect(response.body).toHaveProperty('weekStart');
      expect(response.body).toHaveProperty('weekEnd');
      expect(Array.isArray(response.body.serviceDays)).toBe(true);
    });

    it('should export weekly report as CSV', async () => {
      const response = await authenticatedRequest(helper, cateringToken)
        .get(`/api/contracts/${contractId}/reports/weekly/csv`)
        .query({
          weekStart: new Date().toISOString().split('T')[0],
        })
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/csv/);
      expect(response.text).toContain('Service Date');
    });
  });

  describe('🏥 Health Check', () => {
    it('should return health status without authentication', async () => {
      const response = await helper.request().get('/api/health').expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.database).toBe('connected');
      expect(response.body.timestamp).toBeTruthy();
    });
  });
});
