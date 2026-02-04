import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './modules/auth/auth.module';
import { CateringModule } from './modules/catering/catering.module';
import { ClientModule } from './modules/client/client.module';
import { ContractModule } from './modules/contract/contract.module';
import { ServiceDayModule } from './modules/service-day/service-day.module';
import { SeedModule } from './modules/seed/seed.module';
import { DatabaseModule } from './shared/infrastructure/database/database.module';
import { OutboxModule } from './shared/outbox';

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
    SeedModule,
  ],
})
export class AppModule {}
