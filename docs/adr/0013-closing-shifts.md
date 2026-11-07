# 0013. Close shifts by hand and automatically overnight

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Closing a shift locks its cards and totals, so reports can be trusted. The plan had admins closing shifts, but staff may not be present when service ends. A shift left open could be changed by accident for days.

## Decision

- Distribution or an admin can close a shift at the end of service, after a confirmation.
- Any open shift from an earlier date closes automatically. The server checks when it starts and hourly after that, using the food bank's time zone (the `TIME_ZONE` setting).
- Only an admin can reopen a shift.
- A reopened shift stays open until someone closes it by hand, so that the automatic close does not undo the admin's correction.
- Every close and reopen is recorded in the audit log, with automatic closes under the actor `automatic`.

## Alternatives considered

- **Admin only:** Shifts could stay unlocked for days if no staff member is present.
- **Any role can close:** The front desk usually finishes first, so an early close becomes more likely.
- **Automatic only:** No early locking at the end of service, so totals could still change that evening.

## Consequences

Shifts reliably lock with no training or staff presence. A volunteer can close a shift too early, which then needs an admin to fix. A reopened shift that nobody closes stays open indefinitely. The server's time zone setting must be correct, though an error only shifts the close by a few hours.
