export type CompanyStatus = 'ACTIVE' | 'INACTIVE';

export interface CateringCompany {
  id: string;
  name: string;
  taxId: string | null;
  status: CompanyStatus;
  dailyCapacity: number;
  createdAt: Date;
  updatedAt: Date;
}
