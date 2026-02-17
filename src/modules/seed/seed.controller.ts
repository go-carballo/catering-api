import { Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../shared/decorators/public.decorator';
import { SeedService } from './seed.service';

interface SeedResponse {
  message: string;
  credentials: {
    password: string;
    catering: string[];
    clients: string[];
  };
}

@ApiTags('seed')
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post()
  @Public()
  @ApiOperation({
    summary:
      'Seed database with sample data (PROTECTED ENDPOINT - Development Only)',
  })
  async seed(): Promise<SeedResponse> {
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
