import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './modules/auth/auth.module';
import { CateringModule } from './modules/catering/catering.module';
import { ClientModule } from './modules/client/client.module';
import { ContractModule } from './modules/contract/contract.module';
import { ServiceDayModule } from './modules/service-day/service-day.module';
import { SeedModule } from './modules/seed/seed.module';
import { HealthModule } from './modules/health/health.module';
import { DatabaseModule } from './shared/infrastructure/database/database.module';
import { OutboxModule } from './shared/outbox';
import { SessionActivityMiddleware } from './shared/middleware/session-activity.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    OutboxModule, // Provides EventBus + OutboxProcessor (includes ScheduleModule)
    AuthModule,
    CateringModule,
    ClientModule,
    ContractModule,
    ServiceDayModule,
    HealthModule,
    SeedModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionActivityMiddleware).forRoutes('*');
  }
}
