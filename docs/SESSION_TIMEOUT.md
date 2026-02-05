# Session Timeout Implementation

## Overview

Session timeout automatically logs out users after a period of inactivity. This improves security by preventing unauthorized access on unattended devices.

## How It Works

### Backend (NestJS)

1. **Schema Update**: Added `lastActivityAt` field to `companies` table
   - Tracks the last time a user made an authenticated request
   - Nullable field (null until first activity)

2. **SessionActivityMiddleware**: Automatically updates `lastActivityAt` on every authenticated request
   - Non-blocking: updates happen asynchronously
   - Fire-and-forget: failures don't interrupt the request
   - Only applies to authenticated requests (skips public routes)

3. **Session Status Endpoint**: `GET /auth/session-status`
   - Returns `isActive: true` and `lastActivityAt` timestamp
   - Used by frontend to validate session and reset timer
   - Requires authentication

### Frontend (Next.js)

1. **useSessionTimeout Hook**
   - Tracks user activity (mouse, keyboard, touch events)
   - Debounces activity (min 5 seconds between resets)
   - Manages warning modal display
   - Auto-logout capability

2. **SessionWarningModal Component**
   - Appears 5 minutes before timeout
   - Shows countdown timer
   - Allows user to extend session or logout

3. **Integration**
   - Integrated in `(protected)/layout.tsx`
   - Only active for authenticated users
   - Configurable timeouts via hook options

## Configuration

### Environment Variables

```env
# Optional - defaults shown below
SESSION_TIMEOUT_MINUTES=60        # Total session timeout (default: 60 min)
SESSION_WARNING_MINUTES=5         # Warning appears X min before timeout (default: 5 min)
```

### Frontend Hook Options

```typescript
const session = useSessionTimeout({
  timeoutMinutes: 60, // Total inactivity timeout
  warningMinutes: 5, // When to show warning
  autoLogout: true, // Auto-logout on timeout (default)
  trackingEvents: [
    // Activities that reset timer
    'mousedown',
    'keydown',
    'touchstart',
  ],
});
```

## Security Implications

✅ **Prevents unauthorized access** on unattended devices  
✅ **User-friendly**: 5-minute warning before logout  
✅ **Activity-based**: Resets on any interaction  
✅ **Server-side tracking**: `lastActivityAt` persisted in database  
✅ **No data loss**: User can save work before timeout

## Timeline

### Default: 60-minute timeout with 5-minute warning

```
0:00 min   ← User logs in / last activity
...
55:00 min  ← 5 minutes before logout
           ← Warning modal appears
           ← Countdown timer starts
60:00 min  ← Auto-logout
           ← Redirect to /login
```

If user extends session at 59:00, timer resets to 60 minutes.

## API Contract

### Session Status Response

```json
{
  "isActive": true,
  "lastActivityAt": "2026-02-05T15:30:45.123Z"
}
```

### Database Schema

```sql
ALTER TABLE companies ADD COLUMN last_activity_at TIMESTAMP WITH TIME ZONE;
```

## Testing

### Manual Testing

1. **Start session**: Login at time T
2. **Wait 55 minutes**: No activity
3. **Verify warning**: Modal appears at T+55min
4. **Test extend**: Click "Continuar conectado" button
5. **Verify reset**: Timer resets, session continues
6. **Test logout**: Let timeout complete without extending
7. **Verify logout**: Automatically redirected to login

### Programmatic Testing

```typescript
// Test with short timeout for faster testing
const session = useSessionTimeout({
  timeoutMinutes: 1, // 1 minute timeout
  warningMinutes: 0.5, // Warning at 30 seconds
});

// Simulate inactivity by disabling events
// Should see warning modal after configured time
```

## Known Limitations

1. **Client-side detection only**: If user is completely idle (no events), frontend can't detect server-side timeout
   - Solution: Server can invalidate tokens independently
2. **Multiple tabs**: Each tab has independent timeout
   - User activity in Tab A doesn't reset Tab B's timer
   - Acceptable for security; user can click anywhere to refresh
3. **Network offline**: Countdown continues while offline
   - When reconnected, user will be logged out if timeout passed
   - API calls will fail with 401, triggering logout

## Future Enhancements

- [ ] Sync timeout across browser tabs using BroadcastChannel API
- [ ] Server-side token invalidation at configured timeout
- [ ] Configurable warning message and button text
- [ ] Analytics: Track session extensions, timeouts, reasons
- [ ] Admin setting: Global timeout duration for all users
- [ ] Remember me: Option to extend timeout on next login

## Files Changed

### Backend

- `src/shared/infrastructure/database/schema/schema.ts` - Added `lastActivityAt` field
- `src/shared/middleware/session-activity.middleware.ts` - New middleware
- `src/main.ts` - Register middleware
- `src/modules/auth/infrastructure/auth.controller.ts` - Added `/auth/session-status` endpoint
- `src/shared/decorators/get-company.decorator.ts` - Added `lastActivityAt` to CurrentCompany
- `drizzle/migrations/0007_session_timeout.sql` - Migration file

### Frontend

- `src/hooks/use-session-timeout.ts` - New hook
- `src/components/auth/session-warning-modal.tsx` - New component
- `src/app/(protected)/layout.tsx` - Integrated session timeout
- `src/hooks/index.ts` - Export new hook

## Migration

No breaking changes. Existing systems continue to work without session timeout if not configured.

To enable session timeout:

1. Deploy backend with database migration
2. Update frontend to include SessionWarningModal
3. Configure timeouts via environment variables (optional)
