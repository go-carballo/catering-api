/**
 * Port for tracking analytics events.
 *
 * Implementations could be: Segment, Mixpanel, custom analytics, etc.
 */
export interface AnalyticsPort {
  /**
   * Track an analytics event.
   */
  track(event: AnalyticsEvent): Promise<void>;

  /**
   * Identify a user/company with traits.
   */
  identify(identity: AnalyticsIdentity): Promise<void>;
}

export interface AnalyticsEvent {
  /** Event name (e.g., 'contract_created', 'service_day_confirmed') */
  event: string;
  /** Who performed this action */
  actorId?: string;
  /** Event properties */
  properties: Record<string, unknown>;
  /** When it happened (defaults to now) */
  timestamp?: Date;
}

export interface AnalyticsIdentity {
  /** User or company ID */
  id: string;
  /** Traits to associate */
  traits: Record<string, unknown>;
}

export const ANALYTICS_PORT = Symbol('ANALYTICS_PORT');
