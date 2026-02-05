import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentCompany {
  id: string;
  email: string;
  name: string;
  companyType: 'CATERING' | 'CLIENT';
  status: 'ACTIVE' | 'INACTIVE';
  lastActivityAt?: Date | null;
}

export const GetCompany = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentCompany => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
