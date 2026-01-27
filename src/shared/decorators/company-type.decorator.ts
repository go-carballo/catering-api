import { SetMetadata } from '@nestjs/common';

export const COMPANY_TYPES_KEY = 'companyTypes';

/**
 * Decorator to restrict endpoint access based on company type.
 *
 * @example
 * // Only clients can access this endpoint
 * @CompanyType('CLIENT')
 * @Post('confirm-expected')
 * confirmExpected() {}
 *
 * @example
 * // Both clients and caterings can access
 * @CompanyType('CLIENT', 'CATERING')
 * @Get('shared-resource')
 * getSharedResource() {}
 */
export const CompanyType = (...types: Array<'CLIENT' | 'CATERING'>) =>
  SetMetadata(COMPANY_TYPES_KEY, types);
