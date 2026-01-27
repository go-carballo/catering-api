import { describe, it, expect } from 'vitest';
import {
  isValidQuantityRange,
  isQuantityWithinRange,
  canTransition,
  getNextStatus,
  getInvalidTransitionReason,
  validateCateringCompany,
  validateClientCompany,
  type CompanyInfo,
} from './contract.rules';

describe('Contract Domain Rules', () => {
  // ============ QUANTITY RULES ============

  describe('isValidQuantityRange', () => {
    it('should return true when min equals max', () => {
      expect(
        isValidQuantityRange({ minDailyQuantity: 10, maxDailyQuantity: 10 }),
      ).toBe(true);
    });

    it('should return true when min is less than max', () => {
      expect(
        isValidQuantityRange({ minDailyQuantity: 5, maxDailyQuantity: 50 }),
      ).toBe(true);
    });

    it('should return false when min is greater than max', () => {
      expect(
        isValidQuantityRange({ minDailyQuantity: 50, maxDailyQuantity: 10 }),
      ).toBe(false);
    });

    it('should handle zero values', () => {
      expect(
        isValidQuantityRange({ minDailyQuantity: 0, maxDailyQuantity: 0 }),
      ).toBe(true);
      expect(
        isValidQuantityRange({ minDailyQuantity: 0, maxDailyQuantity: 10 }),
      ).toBe(true);
    });
  });

  describe('isQuantityWithinRange', () => {
    const range = { minDailyQuantity: 10, maxDailyQuantity: 50 };

    it('should return true for quantity at minimum', () => {
      expect(isQuantityWithinRange(10, range)).toBe(true);
    });

    it('should return true for quantity at maximum', () => {
      expect(isQuantityWithinRange(50, range)).toBe(true);
    });

    it('should return true for quantity in middle of range', () => {
      expect(isQuantityWithinRange(30, range)).toBe(true);
    });

    it('should return false for quantity below minimum', () => {
      expect(isQuantityWithinRange(9, range)).toBe(false);
    });

    it('should return false for quantity above maximum', () => {
      expect(isQuantityWithinRange(51, range)).toBe(false);
    });
  });

  // ============ STATUS STATE MACHINE ============

  describe('canTransition', () => {
    describe('from ACTIVE', () => {
      it('should allow pause', () => {
        expect(canTransition('ACTIVE', 'pause')).toBe(true);
      });

      it('should allow terminate', () => {
        expect(canTransition('ACTIVE', 'terminate')).toBe(true);
      });

      it('should not allow resume', () => {
        expect(canTransition('ACTIVE', 'resume')).toBe(false);
      });
    });

    describe('from PAUSED', () => {
      it('should allow resume', () => {
        expect(canTransition('PAUSED', 'resume')).toBe(true);
      });

      it('should allow terminate', () => {
        expect(canTransition('PAUSED', 'terminate')).toBe(true);
      });

      it('should not allow pause', () => {
        expect(canTransition('PAUSED', 'pause')).toBe(false);
      });
    });

    describe('from TERMINATED', () => {
      it('should not allow any transitions', () => {
        expect(canTransition('TERMINATED', 'pause')).toBe(false);
        expect(canTransition('TERMINATED', 'resume')).toBe(false);
        expect(canTransition('TERMINATED', 'terminate')).toBe(false);
      });
    });
  });

  describe('getNextStatus', () => {
    it('should return PAUSED when pausing ACTIVE', () => {
      expect(getNextStatus('ACTIVE', 'pause')).toBe('PAUSED');
    });

    it('should return ACTIVE when resuming PAUSED', () => {
      expect(getNextStatus('PAUSED', 'resume')).toBe('ACTIVE');
    });

    it('should return TERMINATED when terminating from any valid status', () => {
      expect(getNextStatus('ACTIVE', 'terminate')).toBe('TERMINATED');
      expect(getNextStatus('PAUSED', 'terminate')).toBe('TERMINATED');
    });

    it('should return null for invalid transitions', () => {
      expect(getNextStatus('ACTIVE', 'resume')).toBeNull();
      expect(getNextStatus('TERMINATED', 'pause')).toBeNull();
    });
  });

  describe('getInvalidTransitionReason', () => {
    it('should return null for valid transitions', () => {
      expect(getInvalidTransitionReason('ACTIVE', 'pause')).toBeNull();
      expect(getInvalidTransitionReason('PAUSED', 'resume')).toBeNull();
    });

    it('should return reason for terminated contract', () => {
      expect(getInvalidTransitionReason('TERMINATED', 'pause')).toBe(
        'Cannot pause a terminated contract',
      );
      expect(getInvalidTransitionReason('TERMINATED', 'resume')).toBe(
        'Cannot resume a terminated contract',
      );
    });

    it('should return reason when already paused', () => {
      expect(getInvalidTransitionReason('PAUSED', 'pause')).toBe(
        'Contract is already paused',
      );
    });

    it('should return reason when already active', () => {
      expect(getInvalidTransitionReason('ACTIVE', 'resume')).toBe(
        'Contract is already active',
      );
    });
  });

  // ============ COMPANY VALIDATION ============

  describe('validateCateringCompany', () => {
    const validCatering: CompanyInfo = {
      id: 'catering-1',
      name: 'Test Catering',
      companyType: 'CATERING',
      status: 'ACTIVE',
    };

    it('should return valid for active catering company', () => {
      const result = validateCateringCompany(validCatering, 'catering-1');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return error when company not found', () => {
      const result = validateCateringCompany(null, 'missing-id');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Catering company #missing-id not found');
    });

    it('should return error when company type is CLIENT', () => {
      const clientCompany: CompanyInfo = {
        ...validCatering,
        companyType: 'CLIENT',
      };
      const result = validateCateringCompany(clientCompany, 'catering-1');
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        'Company "Test Catering" is not a catering company',
      );
    });

    it('should return error when company is inactive', () => {
      const inactiveCompany: CompanyInfo = {
        ...validCatering,
        status: 'INACTIVE',
      };
      const result = validateCateringCompany(inactiveCompany, 'catering-1');
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        'Catering company "Test Catering" is not active',
      );
    });
  });

  describe('validateClientCompany', () => {
    const validClient: CompanyInfo = {
      id: 'client-1',
      name: 'Test Client',
      companyType: 'CLIENT',
      status: 'ACTIVE',
    };

    it('should return valid for active client company', () => {
      const result = validateClientCompany(validClient, 'client-1');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return error when company not found', () => {
      const result = validateClientCompany(null, 'missing-id');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Client company #missing-id not found');
    });

    it('should return error when company type is CATERING', () => {
      const cateringCompany: CompanyInfo = {
        ...validClient,
        companyType: 'CATERING',
      };
      const result = validateClientCompany(cateringCompany, 'client-1');
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        'Company "Test Client" is not a client company',
      );
    });

    it('should return error when company is inactive', () => {
      const inactiveCompany: CompanyInfo = {
        ...validClient,
        status: 'INACTIVE',
      };
      const result = validateClientCompany(inactiveCompany, 'client-1');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Client company "Test Client" is not active');
    });
  });
});
