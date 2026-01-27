import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyTypeGuard } from './company-type.guard';
import { COMPANY_TYPES_KEY } from '../decorators/company-type.decorator';

describe('CompanyTypeGuard', () => {
  let guard: CompanyTypeGuard;
  let reflector: Reflector;

  function createMockContext(user: any): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  }

  beforeEach(() => {
    reflector = new Reflector();
    guard = new CompanyTypeGuard(reflector);
  });

  describe('when no @CompanyType decorator is present', () => {
    it('should allow access (no restriction)', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const context = createMockContext({ companyType: 'CLIENT' });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when decorator returns empty array', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);

      const context = createMockContext({ companyType: 'CATERING' });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('when @CompanyType("CLIENT") is present', () => {
    beforeEach(() => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['CLIENT']);
    });

    it('should allow CLIENT company', () => {
      const context = createMockContext({
        id: 'client-123',
        companyType: 'CLIENT',
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny CATERING company with 403', () => {
      const context = createMockContext({
        id: 'catering-123',
        companyType: 'CATERING',
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'This action is restricted to CLIENT companies',
      );
    });
  });

  describe('when @CompanyType("CATERING") is present', () => {
    beforeEach(() => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['CATERING']);
    });

    it('should allow CATERING company', () => {
      const context = createMockContext({
        id: 'catering-123',
        companyType: 'CATERING',
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny CLIENT company with 403', () => {
      const context = createMockContext({
        id: 'client-123',
        companyType: 'CLIENT',
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'This action is restricted to CATERING companies',
      );
    });
  });

  describe('when @CompanyType("CLIENT", "CATERING") is present', () => {
    beforeEach(() => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
        'CLIENT',
        'CATERING',
      ]);
    });

    it('should allow CLIENT company', () => {
      const context = createMockContext({ companyType: 'CLIENT' });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow CATERING company', () => {
      const context = createMockContext({ companyType: 'CATERING' });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['CLIENT']);
    });

    it('should throw if user is not authenticated', () => {
      const context = createMockContext(undefined);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'User not authenticated',
      );
    });

    it('should throw if user has no companyType', () => {
      const context = createMockContext({ id: 'user-123' });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'User not authenticated',
      );
    });
  });
});
