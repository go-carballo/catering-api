import { E2ETestHelper } from './e2e-helper'; // Import to ensure .env.test is loaded

describe('App Bootstrap (e2e)', () => {
  let helper: E2ETestHelper;

  beforeEach(async () => {
    helper = new E2ETestHelper();
    await helper.setup();
  });

  afterEach(async () => {
    await helper.teardown();
  });

  it('should initialize NestJS application', () => {
    expect(helper.getApp()).toBeDefined();
  });

  it('should return 404 for root path (no default endpoint)', async () => {
    return helper.request().get('/').expect(404);
  });

  it('should have Swagger docs available', async () => {
    return helper.request().get('/docs').expect(200);
  });

  it('should have health check endpoint available without auth', async () => {
    return helper
      .request()
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBeDefined();
        expect(res.body.database).toBeDefined();
      });
  });
});
