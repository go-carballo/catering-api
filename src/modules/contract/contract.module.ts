import { Module, forwardRef } from '@nestjs/common';
import { ContractController } from './infrastructure/contract.controller';
import { ContractService } from './application/contract.service';
import { ContractEventHandlers } from './application/event-handlers';
import { ServiceDayModule } from '../service-day/service-day.module';

@Module({
  imports: [forwardRef(() => ServiceDayModule)],
  controllers: [ContractController],
  providers: [ContractService, ContractEventHandlers],
  exports: [ContractService],
})
export class ContractModule {}
