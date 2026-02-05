import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Inject } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import {
  DRIZZLE,
  type DrizzleClient,
} from '../infrastructure/database/database.module';
import { companies } from '../infrastructure/database/schema/schema';

interface RequestWithUser extends Request {
  user?: { id: string };
}

@Injectable()
export class SessionActivityMiddleware implements NestMiddleware {
  private readonly logger = new Logger('SessionActivityMiddleware');

  constructor(@Inject(DRIZZLE) private db: DrizzleClient) {}

  async use(req: RequestWithUser, res: Response, next: NextFunction) {
    // Only track activity for authenticated requests
    if (req.user?.id) {
      try {
        // Update last activity time - await to ensure it completes
        await this.db
          .update(companies)
          .set({ lastActivityAt: sql`now()` })
          .where(eq(companies.id, req.user.id))
          .execute()
          .catch((err) => {
            // Log but don't throw - activity tracking is nice-to-have
            this.logger.warn(`Failed to update session activity: ${err}`);
          });
      } catch (error) {
        // Silently fail - don't interrupt the request
        this.logger.warn(`Session activity middleware error: ${error}`);
      }
    }

    next();
  }
}
