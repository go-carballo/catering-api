import { IsInt, Min, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmExpectedDto {
  @ApiProperty({
    example: 150,
    description: 'Expected number of meals for the day',
  })
  @IsInt()
  @Min(0)
  expectedQuantity: number;
}

export class ConfirmServedDto {
  @ApiProperty({ example: 145, description: 'Actual number of meals served' })
  @IsInt()
  @Min(0)
  servedQuantity: number;
}

export class GenerateServiceDaysDto {
  @ApiProperty({
    example: '2025-01-20',
    description: 'Start date (YYYY-MM-DD)',
  })
  @IsDateString()
  fromDate: string;

  @ApiProperty({ example: '2025-01-31', description: 'End date (YYYY-MM-DD)' })
  @IsDateString()
  toDate: string;
}

export class DateRangeQueryDto {
  @ApiProperty({ example: '2025-01-01', description: 'From date (YYYY-MM-DD)' })
  @IsDateString()
  from: string;

  @ApiProperty({ example: '2025-01-31', description: 'To date (YYYY-MM-DD)' })
  @IsDateString()
  to: string;
}

export class WeekStartQueryDto {
  @ApiProperty({
    example: '2025-01-20',
    description: 'Week start date (Monday, YYYY-MM-DD)',
  })
  @IsDateString()
  weekStart: string;
}
