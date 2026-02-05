import { ApiProperty } from '@nestjs/swagger';

export class BudgetMetricsDto {
  @ApiProperty({
    description: 'Total consumed (invoiced services) for current month',
    example: 450000,
  })
  consumed: number;

  @ApiProperty({
    description:
      'Total estimated cost based on expected quantities for current month',
    example: 520000,
  })
  estimated: number;

  @ApiProperty({
    description: 'Projected end of month cost based on current trend',
    example: 585000,
  })
  projectedEndOfMonth: number;

  @ApiProperty({
    description: 'Total consumed for previous month',
    example: 462000,
  })
  previousMonth: number;
}

export class CostPerPersonMetricDto {
  @ApiProperty({ example: 345 })
  current: number;

  @ApiProperty({ example: 375 })
  previousMonth: number;

  @ApiProperty({ example: -8.0, description: 'Percentage change' })
  change: number;
}

export class UtilizationRateMetricDto {
  @ApiProperty({ example: 78, description: 'Percentage' })
  current: number;

  @ApiProperty({ example: 73, description: 'Percentage' })
  previousMonth: number;

  @ApiProperty({ example: 5.0, description: 'Percentage change' })
  change: number;
}

export class NextInvoiceDto {
  @ApiProperty({ example: 28500 })
  amount: number;

  @ApiProperty({ example: 5 })
  dueInDays: number;

  @ApiProperty({ example: 'Catering Delicias' })
  vendor: string;
}

export class UpcomingServicesDto {
  @ApiProperty({ example: 12, description: 'Number of services next 7 days' })
  count: number;

  @ApiProperty({
    example: 45000,
    description: 'Estimated cost for next 7 days',
  })
  estimatedCost: number;
}

export class KpisDto {
  @ApiProperty({ type: CostPerPersonMetricDto })
  costPerPerson: CostPerPersonMetricDto;

  @ApiProperty({ type: UtilizationRateMetricDto })
  utilizationRate: UtilizationRateMetricDto;

  @ApiProperty({
    example: 2,
    description: 'Number of contracts with >10% deviation',
  })
  contractsWithDeviation: number;

  @ApiProperty({ type: UpcomingServicesDto })
  upcomingServicesWeek: UpcomingServicesDto;
}

export class RecentServiceDto {
  @ApiProperty({ example: 'abc-123-def-456' })
  id: string;

  @ApiProperty({ example: '2024-02-05' })
  date: string;

  @ApiProperty({ example: 'contract-id-123' })
  contractId: string;

  @ApiProperty({ example: 'Catering Delicias' })
  cateringCompanyName: string;

  @ApiProperty({ example: 'TechCorp SA' })
  clientCompanyName: string;

  @ApiProperty({ example: 45 })
  expected: number | null;

  @ApiProperty({ example: 42 })
  actual: number | null;

  @ApiProperty({ example: -3 })
  deviation: number | null;

  @ApiProperty({ example: 12600 })
  cost: number | null;

  @ApiProperty({ example: 'CONFIRMED' })
  status: string;
}

export class FinanceMetricsResponseDto {
  @ApiProperty({ type: BudgetMetricsDto })
  budget: BudgetMetricsDto;

  @ApiProperty({ type: KpisDto })
  kpis: KpisDto;

  @ApiProperty({ type: [RecentServiceDto] })
  recentServices: RecentServiceDto[];
}
