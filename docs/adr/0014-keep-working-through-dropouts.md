# 0014. Queue writes on the device during connection dropouts

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Both stations are expected to have solid Wi-Fi, but brief dropouts will happen during a shift. Families are still waiting at that moment, so a station cannot stop and wait for the connection. Entries must not be lost or duplicated, and a volunteer must be able to tell what has not reached the server yet.

The app must also be installable on Windows, macOS, iOS and Android (ADR 0004), and a device might be reloaded or restarted during an outage.

## Decision

**Install.** The client ships a web app manifest and a service worker. The service worker keeps only the app's own files available offline. It never handles `/api`, so data is never served from a stale cache.

**Queue.** Card entries, card changes, returned items and partner batches go through an outbox on the device (`client/src/outbox.ts`):

- A write is sent immediately if nothing is waiting. Otherwise it joins the queue, so that writes always reach the server in the order they were made.
- The queue is saved in `localStorage` under a key per login, so it survives a reload or restart.
- Network failures, 5xx, 408 and 429 keep the write for a later retry.
- A 401 keeps the queue and returns to the sign-in screen. The queue is sent after that login signs in again.
- Any other refusal removes the write and reports it on screen with its details until someone dismisses it. A refused entry cannot succeed on retry, and blocking the queue behind it would stop every later entry.
- Records are created with a client-generated ID, so a repeat after a lost response does not create a duplicate.
- After each card change is sent, later queued changes to that card take the new revision number, so a station's own queue does not trip the stale-write check. Changes made elsewhere in the meantime are still detected.

**Display.** Screens show the server's state plus the queue (`client/src/pending.ts`). New cards appear marked "waiting to send", and a count of waiting entries stays on screen. A waiting card cannot be called forward, because it has no server ID until it arrives.

**Resync.** A station sends its queue and reloads the shift when the socket opens, when the browser reports the connection has returned, and every 30 seconds. The timer covers a socket that stops delivering without closing.

**Reload during an outage.** The signed-in username and role and the last shift seen are also saved in `localStorage`. The saved shift is only used for the same date. Opening or closing a shift, signing out and removing a batch need a connection, and say so if tried without one.

## Alternatives considered

- **Block entry until the connection returns.** The simplest option, but it stops the line for a brief dropout, or sends volunteers to paper and then double entry.
- **Paper for every dropout.** Remains the procedure for a long outage, but is too costly to use for a dropout of a few seconds.
- **IndexedDB and Background Sync.** IndexedDB suits much larger data than a short queue. Background Sync would send entries after the app is closed, but its browser support would need checking on all four platforms. Stations are open and in use while they are queuing, so sending from the page is enough.
- **Merge conflicting changes automatically.** A stale change to a real family's card should be seen by a person (see ADR 0003), so it is reported instead.

## Consequences

- A station can keep working through a dropout, and other stations show only what has arrived. The two can differ until the queue is sent, and the banner says so. Totals on the disconnected station include its own waiting card changes but not its waiting new cards or batches.
- Unlike the shared server record, a waiting entry exists on one device only. If that device is lost or its browser data is cleared during an outage, the entry is gone.
- Queued data and the saved shift sit unencrypted in `localStorage`. This is acceptable because cards hold no personal data (ADR 0002). The session itself stays in its protected cookie. Any future personal data would need this decision revisited.
- Signing out while entries are waiting leaves them on the device until the same login signs in again.
- The list of refused entries is not saved, so a reload clears it. A person may therefore miss a refusal if a device reloads unattended.
- Two tabs of one login on a device would each hold their own copy of the queue and overwrite each other's saved copy. Stations are dedicated devices running one window, so this is not handled. Revisit if personal devices become common.
- `localStorage` and service worker behavior on iOS still needs testing on real devices, particularly for an installed app.
