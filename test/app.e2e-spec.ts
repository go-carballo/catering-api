import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('App Bootstrap (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should initialize NestJS application', () => {
    expect(app).toBeDefined();
  });

  it('should return 404 for root path (no default endpoint)', async () => {
    return request(app.getHttpServer()).get('/').expect(404);
  });

  it('should have Swagger docs available', async () => {
    return request(app.getHttpServer()).get('/docs').expect(200);
  });

  it('should have health check endpoint available without auth', async () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBeDefined();
        expect(res.body.database).toBeDefined();
      });
  });
});
