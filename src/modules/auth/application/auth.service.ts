import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DRIZZLE } from '../../../shared/infrastructure/database/database.module';
import type { DrizzleClient } from '../../../shared/infrastructure/database/drizzle.client';
import { companies } from '../../../shared/infrastructure/database/schema';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string; // company ID
  email: string;
  companyType: 'CATERING' | 'CLIENT';
}

export interface AuthResponse {
  accessToken: string;
  company: {
    id: string;
    name: string;
    email: string;
    companyType: 'CATERING' | 'CLIENT';
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    const [company] = await this.db
      .select()
      .from(companies)
      .where(eq(companies.email, dto.email))
      .limit(1);

    if (!company) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      company.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (company.status !== 'ACTIVE') {
      throw new UnauthorizedException('Company account is inactive');
    }

    const payload: JwtPayload = {
      sub: company.id,
      email: company.email,
      companyType: company.companyType,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        companyType: company.companyType,
      },
    };
  }

  async validateCompany(payload: JwtPayload) {
    const [company] = await this.db
      .select({
        id: companies.id,
        email: companies.email,
        name: companies.name,
        companyType: companies.companyType,
        status: companies.status,
      })
      .from(companies)
      .where(eq(companies.id, payload.sub))
      .limit(1);

    if (!company || company.status !== 'ACTIVE') {
      return null;
    }

    return company;
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}
