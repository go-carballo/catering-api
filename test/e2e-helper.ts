import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import request from 'supertest';
import { App } from 'supertest/types';

/**
 * E2E Test Helper
 * Provides utilities for E2E testing with a real Nest application instance
 */
export class E2ETestHelper {
  app: INestApplication<App>;
  moduleFixture: TestingModule;

  async setup(): Promise<void> {
    this.moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    this.app = this.moduleFixture.createNestApplication();
    this.app.useGlobalPipes(new ValidationPipe());
    await this.app.init();
  }

  async teardown(): Promise<void> {
    await this.app?.close();
  }

  getApp(): INestApplication<App> {
    return this.app;
  }

  request() {
    return request(this.app.getHttpServer());
  }
}

/**
 * Login and get tokens
 */
export async function loginUser(
  helper: E2ETestHelper,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await helper
    .request()
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);

  return {
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
  };
}

/**
 * Make authenticated request
 */
export function authenticatedRequest(
  helper: E2ETestHelper,
  accessToken: string,
) {
  return {
    get: (path: string) =>
      helper.request().get(path).set('Authorization', `Bearer ${accessToken}`),
    post: (path: string) =>
      helper.request().post(path).set('Authorization', `Bearer ${accessToken}`),
    patch: (path: string) =>
      helper
        .request()
        .patch(path)
        .set('Authorization', `Bearer ${accessToken}`),
    delete: (path: string) =>
      helper
        .request()
        .delete(path)
        .set('Authorization', `Bearer ${accessToken}`),
  };
}
