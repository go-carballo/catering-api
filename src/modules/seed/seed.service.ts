import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as bcrypt from 'bcryptjs';
import {
  companies,
  cateringProfiles,
  clientProfiles,
  clientOfficeDays,
  contracts,
  contractServiceDays,
  serviceDays,
} from '../../shared/infrastructure/database/schema/schema';
import { DRIZZLE } from '../../shared/infrastructure/database/database.module';

@Injectable()
export class SeedService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async seed(): Promise<void> {
    console.log('🌱 Seeding database...\n');

    const DEFAULT_PASSWORD = 'password123';
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // Clean existing data (in reverse order of dependencies)
    console.log('🧹 Cleaning existing data...');
    await this.db.delete(serviceDays);
    await this.db.delete(contractServiceDays);
    await this.db.delete(contracts);
    await this.db.delete(clientOfficeDays);
    await this.db.delete(clientProfiles);
    await this.db.delete(cateringProfiles);
    await this.db.delete(companies);

    // ============ CATERING COMPANIES ============
    console.log('🍽️  Creating catering companies...');

    const [catering1] = await this.db
      .insert(companies)
      .values({
        companyType: 'CATERING',
        name: 'Delicias del Sur',
        email: 'delicias@example.com',
        passwordHash,
        taxId: '30-71234567-8',
        status: 'ACTIVE',
      })
      .returning();

    await this.db.insert(cateringProfiles).values({
      companyId: catering1.id,
      dailyCapacity: 500,
    });

    const [catering2] = await this.db
      .insert(companies)
      .values({
        companyType: 'CATERING',
        name: 'Sabores Corporativos',
        email: 'sabores@example.com',
        passwordHash,
        taxId: '30-89876543-2',
        status: 'ACTIVE',
      })
      .returning();

    await this.db.insert(cateringProfiles).values({
      companyId: catering2.id,
      dailyCapacity: 300,
    });

    const [catering3] = await this.db
      .insert(companies)
      .values({
        companyType: 'CATERING',
        name: 'Chef Express',
        email: 'chef@example.com',
        passwordHash,
        taxId: '30-55667788-9',
        status: 'ACTIVE',
      })
      .returning();

    await this.db.insert(cateringProfiles).values({
      companyId: catering3.id,
      dailyCapacity: 200,
    });

    console.log(`   ✓ Created 3 catering companies`);

    // ============ CLIENT COMPANIES ============
    console.log('🏢 Creating client companies...');

    const [client1] = await this.db
      .insert(companies)
      .values({
        companyType: 'CLIENT',
        name: 'TechCorp Argentina',
        email: 'techcorp@example.com',
        passwordHash,
        taxId: '30-11223344-5',
        status: 'ACTIVE',
      })
      .returning();

    await this.db.insert(clientProfiles).values({
      companyId: client1.id,
      workMode: 'HYBRID',
    });

    await this.db.insert(clientOfficeDays).values([
      { clientCompanyId: client1.id, dow: 1 },
      { clientCompanyId: client1.id, dow: 3 },
      { clientCompanyId: client1.id, dow: 5 },
    ]);

    const [client2] = await this.db
      .insert(companies)
      .values({
        companyType: 'CLIENT',
        name: 'Finanzas Plus',
        email: 'finanzas@example.com',
        passwordHash,
        taxId: '30-99887766-1',
        status: 'ACTIVE',
      })
      .returning();

    await this.db.insert(clientProfiles).values({
      companyId: client2.id,
      workMode: 'ONSITE',
    });

    await this.db.insert(clientOfficeDays).values([
      { clientCompanyId: client2.id, dow: 1 },
      { clientCompanyId: client2.id, dow: 2 },
      { clientCompanyId: client2.id, dow: 3 },
      { clientCompanyId: client2.id, dow: 4 },
      { clientCompanyId: client2.id, dow: 5 },
    ]);

    const [client3] = await this.db
      .insert(companies)
      .values({
        companyType: 'CLIENT',
        name: 'Startup Hub',
        email: 'startup@example.com',
        passwordHash,
        taxId: '30-44556677-3',
        status: 'ACTIVE',
      })
      .returning();

    await this.db.insert(clientProfiles).values({
      companyId: client3.id,
      workMode: 'HYBRID',
    });

    await this.db.insert(clientOfficeDays).values([
      { clientCompanyId: client3.id, dow: 2 },
      { clientCompanyId: client3.id, dow: 4 },
    ]);

    const [client4] = await this.db
      .insert(companies)
      .values({
        companyType: 'CLIENT',
        name: 'Consultora Global',
        email: 'consultora@example.com',
        passwordHash,
        taxId: '30-12345678-0',
        status: 'ACTIVE',
      })
      .returning();

    await this.db.insert(clientProfiles).values({
      companyId: client4.id,
      workMode: 'ONSITE',
    });

    await this.db.insert(clientOfficeDays).values([
      { clientCompanyId: client4.id, dow: 1 },
      { clientCompanyId: client4.id, dow: 2 },
      { clientCompanyId: client4.id, dow: 3 },
      { clientCompanyId: client4.id, dow: 4 },
      { clientCompanyId: client4.id, dow: 5 },
    ]);

    console.log(`   ✓ Created 4 client companies`);

    // ============ CONTRACTS ============
    console.log('📝 Creating contracts...');

    const [contract1] = await this.db
      .insert(contracts)
      .values({
        cateringCompanyId: catering1.id,
        clientCompanyId: client1.id,
        pricePerService: '15.50',
        flexibleQuantity: true,
        minDailyQuantity: 20,
        maxDailyQuantity: 80,
        noticePeriodHours: 24,
        status: 'ACTIVE',
      })
      .returning();

    await this.db.insert(contractServiceDays).values([
      { contractId: contract1.id, dow: 1 },
      { contractId: contract1.id, dow: 3 },
      { contractId: contract1.id, dow: 5 },
    ]);

    const [contract2] = await this.db
      .insert(contracts)
      .values({
        cateringCompanyId: catering1.id,
        clientCompanyId: client2.id,
        pricePerService: '18.00',
        flexibleQuantity: true,
        minDailyQuantity: 50,
        maxDailyQuantity: 150,
        noticePeriodHours: 48,
        status: 'ACTIVE',
      })
      .returning();

    await this.db.insert(contractServiceDays).values([
      { contractId: contract2.id, dow: 1 },
      { contractId: contract2.id, dow: 2 },
      { contractId: contract2.id, dow: 3 },
      { contractId: contract2.id, dow: 4 },
      { contractId: contract2.id, dow: 5 },
    ]);

    const [contract3] = await this.db
      .insert(contracts)
      .values({
        cateringCompanyId: catering2.id,
        clientCompanyId: client3.id,
        pricePerService: '12.00',
        flexibleQuantity: true,
        minDailyQuantity: 10,
        maxDailyQuantity: 40,
        noticePeriodHours: 12,
        status: 'ACTIVE',
      })
      .returning();

    await this.db.insert(contractServiceDays).values([
      { contractId: contract3.id, dow: 2 },
      { contractId: contract3.id, dow: 4 },
    ]);

    const [contract4] = await this.db
      .insert(contracts)
      .values({
        cateringCompanyId: catering3.id,
        clientCompanyId: client4.id,
        pricePerService: '14.75',
        flexibleQuantity: false,
        minDailyQuantity: 30,
        maxDailyQuantity: 30,
        noticePeriodHours: 24,
        status: 'ACTIVE',
      })
      .returning();

    await this.db.insert(contractServiceDays).values([
      { contractId: contract4.id, dow: 1 },
      { contractId: contract4.id, dow: 2 },
      { contractId: contract4.id, dow: 3 },
      { contractId: contract4.id, dow: 4 },
      { contractId: contract4.id, dow: 5 },
    ]);

    const [contract5] = await this.db
      .insert(contracts)
      .values({
        cateringCompanyId: catering2.id,
        clientCompanyId: client1.id,
        pricePerService: '16.00',
        flexibleQuantity: true,
        minDailyQuantity: 15,
        maxDailyQuantity: 60,
        noticePeriodHours: 24,
        status: 'PAUSED',
      })
      .returning();

    await this.db.insert(contractServiceDays).values([
      { contractId: contract5.id, dow: 1 },
      { contractId: contract5.id, dow: 3 },
      { contractId: contract5.id, dow: 5 },
    ]);

    console.log(`   ✓ Created 5 contracts`);

    // ============ SERVICE DAYS ============
    console.log('📅 Creating service days for this week and next week...');

    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1);

    const serviceDayRecords: {
      contractId: string;
      serviceDate: Date;
      expectedQuantity: number | null;
      servedQuantity: number | null;
      status: 'PENDING' | 'CONFIRMED';
    }[] = [];

    // Generate service days for contract1 (Mon, Wed, Fri)
    for (let weekOffset = 0; weekOffset < 2; weekOffset++) {
      for (const dow of [1, 3, 5]) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + (dow - 1) + weekOffset * 7);

        const isPast = date < today;
        serviceDayRecords.push({
          contractId: contract1.id,
          serviceDate: date,
          expectedQuantity: isPast ? Math.floor(Math.random() * 40) + 30 : null,
          servedQuantity: isPast ? Math.floor(Math.random() * 40) + 28 : null,
          status: isPast ? 'CONFIRMED' : 'PENDING',
        });
      }
    }

    // Generate service days for contract2 (Mon-Fri)
    for (let weekOffset = 0; weekOffset < 2; weekOffset++) {
      for (const dow of [1, 2, 3, 4, 5]) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + (dow - 1) + weekOffset * 7);

        const isPast = date < today;
        serviceDayRecords.push({
          contractId: contract2.id,
          serviceDate: date,
          expectedQuantity: isPast ? Math.floor(Math.random() * 50) + 80 : null,
          servedQuantity: isPast ? Math.floor(Math.random() * 50) + 78 : null,
          status: isPast ? 'CONFIRMED' : 'PENDING',
        });
      }
    }

    // Generate service days for contract3 (Tue, Thu)
    for (let weekOffset = 0; weekOffset < 2; weekOffset++) {
      for (const dow of [2, 4]) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + (dow - 1) + weekOffset * 7);

        const isPast = date < today;
        serviceDayRecords.push({
          contractId: contract3.id,
          serviceDate: date,
          expectedQuantity: isPast ? Math.floor(Math.random() * 20) + 15 : null,
          servedQuantity: isPast ? Math.floor(Math.random() * 20) + 14 : null,
          status: isPast ? 'CONFIRMED' : 'PENDING',
        });
      }
    }

    // Generate service days for contract4 (Mon-Fri, fixed quantity)
    for (let weekOffset = 0; weekOffset < 2; weekOffset++) {
      for (const dow of [1, 2, 3, 4, 5]) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + (dow - 1) + weekOffset * 7);

        const isPast = date < today;
        serviceDayRecords.push({
          contractId: contract4.id,
          serviceDate: date,
          expectedQuantity: isPast ? 30 : null,
          servedQuantity: isPast ? 30 : null,
          status: isPast ? 'CONFIRMED' : 'PENDING',
        });
      }
    }

    if (serviceDayRecords.length > 0) {
      await this.db.insert(serviceDays).values(serviceDayRecords);
    }

    console.log(`   ✓ Created ${serviceDayRecords.length} service days`);

    console.log('\n✅ Seed completed successfully!\n');
  }
}
