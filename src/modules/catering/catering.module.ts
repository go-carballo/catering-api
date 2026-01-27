import { Module } from '@nestjs/common';
import { CateringController } from './infrastructure/catering.controller';
import { CateringService } from './application/catering.service';

@Module({
  controllers: [CateringController],
  providers: [CateringService],
  exports: [CateringService],
})
export class CateringModule {}
