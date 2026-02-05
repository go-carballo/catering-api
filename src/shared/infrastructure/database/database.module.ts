import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDrizzleClient } from './drizzle.client';

export const DRIZZLE = Symbol('DRIZZLE');

export type { DrizzleClient } from './drizzle.client';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const connectionString =
          configService.getOrThrow<string>('DATABASE_URL');
        return createDrizzleClient(connectionString);
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
