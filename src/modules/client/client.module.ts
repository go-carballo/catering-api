import { Module } from '@nestjs/common';
import { ClientController } from './infrastructure/client.controller';
import { ClientService } from './application/client.service';

@Module({
  controllers: [ClientController],
  providers: [ClientService],
  exports: [ClientService],
})
export class ClientModule {}
