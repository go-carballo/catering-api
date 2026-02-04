import { Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SeedService } from './seed.service';
import { Public } from '../../shared/decorators/public.decorator';

@ApiTags('seed')
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Seed database with sample data (PUBLIC ENDPOINT)' })
  async seed() {
    await this.seedService.seed();
    return {
      message: 'Database seeded successfully',
      credentials: {
        password: 'password123',
        catering: [
          'delicias@example.com',
          'sabores@example.com',
          'chef@example.com',
        ],
        clients: [
          'techcorp@example.com',
          'finanzas@example.com',
          'startup@example.com',
          'consultora@example.com',
        ],
      },
    };
  }
}
