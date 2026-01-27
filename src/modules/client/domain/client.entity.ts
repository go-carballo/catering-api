export type CompanyStatus = 'ACTIVE' | 'INACTIVE';
export type WorkMode = 'REMOTE' | 'HYBRID' | 'ONSITE';

// Days of week: 1 = Monday, 7 = Sunday (ISO 8601)
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ClientCompany {
  id: string;
  name: string;
  taxId: string | null;
  status: CompanyStatus;
  workMode: WorkMode;
  officeDays: DayOfWeek[];
  createdAt: Date;
  updatedAt: Date;
}
