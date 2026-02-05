import { Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SeedService } from './seed.service';

@ApiTags('seed')
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post()
  @ApiOperation({
    summary:
      'Seed database with sample data (PROTECTED ENDPOINT - Development Only)',
  })
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
