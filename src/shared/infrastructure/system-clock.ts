import { Injectable } from '@nestjs/common';
import type { Clock } from '../domain/clock.port';

/**
 * System clock implementation - uses real system time.
 */
@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
