# 0034. Show the queue on a wall display

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

Distribution volunteers have to walk to the tablet to see who is waiting. A large display in the distribution room can show the queue across the room. ADR 0033 added a read-only `display` role and a feed that leaves out everything the screen does not show. This decision is about the screen itself. The room also holds Families, so what the screen shows has to be safe for them to see.

## Decision

- **For volunteers, the queue only:** The screen shows the families in the queue in two groups, **Confirmed** (being packed) and **Called** (on their way), each in the order they were called (ADR 0032). It shows no totals and nothing about the shift beyond the day.
- **A row:** a very large ticket number, then the family's size and cart count, and a **Senior Box** or **Cheese** badge when the card has one. Never initials, notes or weights. Family size and the badges are visible to anyone in the room, and are already on the tickets Families hold.
- **Always readable from across the room:** a row is 11% of the screen's height, and all sizes follow the height, so any landscape display looks the same. Colors come from the app's tokens, in light and dark, so the screen follows the device's color setting.
- **A long queue ends in a count:** how many rows fit is measured from the screen. When a group is longer, the last place says "+N more waiting" and the rest of the places show the families who have waited longest. At 1920×1080 five families show in each group before the count. Nothing scrolls or rotates by itself.
- **A stale queue is hidden, not marked:** the screen reloads every 30 seconds and listens on the live socket. If the connection has been down for 20 seconds, or nothing has loaded for 70 seconds (two missed reloads, which also catches a socket that has stopped delivering without closing), the queue is replaced by a full-screen **Not connected** notice with the time it last updated. The queue returns by itself. Nobody stands at the wall to notice a small warning, and volunteers would act on a list that looks current.
- **The other states** are each a plain message: loading, no shift open today, shift closed, and no families waiting. Today moves on at midnight without a reload.
- **No controls:** nothing to tap and no sign out. It is signed in once with a borrowed keyboard, and signed in again every 90 days (ADR 0033).

## Alternatives considered

- **Show every family's details:** more help at the wall, but initials and notes are the app's only personal data, and a screen in a shared room is the wrong place for them.
- **Number only:** the safest to show Families, but it adds little over calling a number aloud, because a volunteer still needs the tablet to see the cart count and extras.
- **Dim the queue and show a banner when stale:** volunteers keep a rough picture during a short outage, but a stale list stays on screen and grey is easy to miss from across a room.
- **Shrink rows to fit everyone, or rotate pages:** shrinking makes a long queue unreadable, and rotating makes a volunteer wait for the right page and relies on a timer that can fail quietly.

## Consequences

- At a very long queue, the families furthest back are not on the wall until those ahead are served. The tablet still lists everyone.
- The 20 and 70 second limits are a guess, in `client/src/display-state.ts`. Tune them after trying the wall on the real network.
- The wall has been tried only in an emulated browser at 1920×1080 and 1100×900. A real television, its browser and its Wi-Fi are untried, so the runbook has a first-run checklist.
- The screen is for a landscape display. A portrait display stacks the two groups, which works but has not been tried.
