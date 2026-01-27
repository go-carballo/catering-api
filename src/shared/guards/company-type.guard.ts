import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { COMPANY_TYPES_KEY } from '../decorators/company-type.decorator';

/**
 * Guard that checks if the current user's company type is allowed to access the endpoint.
 *
 * Works in conjunction with @CompanyType() decorator.
 * If no @CompanyType() is specified, access is allowed (no restriction).
 *
 * @example
 * // In controller
 * @CompanyType('CLIENT')
 * @Post('confirm-expected')
 * confirmExpected() {} // Only CLIENT companies can access
 */
@Injectable()
export class CompanyTypeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedTypes = this.reflector.getAllAndOverride<
      Array<'CLIENT' | 'CATERING'>
    >(COMPANY_TYPES_KEY, [context.getHandler(), context.getClass()]);

    // No restriction if decorator not present
    if (!allowedTypes || allowedTypes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.companyType) {
      throw new ForbiddenException('User not authenticated');
    }

    const isAllowed = allowedTypes.includes(user.companyType);

    if (!isAllowed) {
      throw new ForbiddenException(
        `This action is restricted to ${allowedTypes.join(' or ')} companies`,
      );
    }

    return true;
  }
}
