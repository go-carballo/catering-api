import { ServiceDay, ServiceDayEntity } from './service-day.entity';
import {
  Contract,
  ContractEntity,
} from '../../contract/domain/contract.entity';

/**
 * ServiceDay Repository Interface (Port)
 *
 * This is a port in the hexagonal architecture sense.
 * The domain defines WHAT it needs, infrastructure defines HOW.
 */

export interface ServiceDayWithContract {
  serviceDay: ServiceDayEntity;
  contract: ContractEntity;
}

export interface ServiceDayRepository {
  /**
   * Find a service day by ID with its associated contract
   * Returns rich domain entities
   * @returns null if not found
   */
  findByIdWithContract(id: string): Promise<ServiceDayWithContract | null>;

  /**
   * Find all service days eligible for fallback:
   * - expectedQuantity IS NULL
   * - status = PENDING
   * - serviceDate - noticePeriodHours <= currentTime (deadline passed)
   * - contract is ACTIVE
   *
   * @param currentTime The current time to check deadline against
   * @returns Array of service days with their contracts
   */
  findEligibleForFallback(currentTime: Date): Promise<ServiceDayWithContract[]>;

  /**
   * Persist a service day entity
   * @returns the persisted service day data
   */
  save(entity: ServiceDayEntity): Promise<ServiceDay>;
}

export const SERVICE_DAY_REPOSITORY = Symbol('SERVICE_DAY_REPOSITORY');
