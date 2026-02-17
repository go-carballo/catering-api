import { NotAuthorizedError } from '../../../shared/domain/errors';

export type UserRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

/**
 * User data interface (for persistence/transfer)
 */
export interface UserData {
  id: string;
  companyId: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User Entity - Rich domain model with behavior
 */
export class UserEntity {
  readonly id: string;
  readonly companyId: string;
  readonly email: string;
  readonly name: string;
  readonly role: UserRole;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(data: UserData) {
    this.id = data.id;
    this.companyId = data.companyId;
    this.email = data.email;
    this.name = data.name;
    this.role = data.role;
    this.isActive = data.isActive;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  // ============ GUARD METHODS ============

  /**
   * @throws NotAuthorizedError if companyId does not match
   */
  ensureBelongsTo(companyId: string): void {
    if (this.companyId !== companyId) {
      throw new NotAuthorizedError('Not authorized to access this user');
    }
  }

  /**
   * Check if user is active
   */
  ensureActive(): void {
    if (!this.isActive) {
      throw new NotAuthorizedError('User is not active');
    }
  }

  // ============ SERIALIZATION ============

  toData(): UserData {
    return {
      id: this.id,
      companyId: this.companyId,
      email: this.email,
      name: this.name,
      role: this.role,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  static fromData(data: UserData): UserEntity {
    return new UserEntity(data);
  }
}

// Input types for service layer
export interface CreateUserInput {
  email: string;
  name: string;
  role: UserRole;
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  role?: UserRole;
  isActive?: boolean;
}

// Backwards compatibility alias
export type User = UserData;
