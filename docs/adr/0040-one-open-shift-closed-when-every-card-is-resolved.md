# 0040. Keep one shift open at a time, and close it only when every card is resolved

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

The food bank asked for two rules: a shift can't be closed while a card is unresolved, and no two shifts are open at once. Until now closing only warned about cards not yet served (ADR 0013), the overnight close closed every earlier shift whatever its cards, and an admin could reopen an old shift while today's was open.

Together the rules can block a morning. A shift left open overnight with a card still waiting can't be closed (rule 1), today's can't open beside it (rule 3), and the stations only ever loaded today's shift, so no screen could reach the waiting card.

## Decision

- **Resolved cards:** A card is resolved when it is distributed or left without food. Entered, called back and confirmed cards are still waiting.
- **Closing:** `POST /api/shifts/:id/close` answers 409 while any card waits, naming them: "Cards 1 and 2 are still waiting. Mark each distributed or left without food, then close the shift." Distribution's **Finish** panel shows that as a red stop above the list (ADR 0039) and offers **Yes, close the shift** only once the list is empty.
- **Overnight:** The automatic close skips an earlier shift with a card still waiting. It stays open for a person to finish.
- **One open shift:** Opening a shift, or an admin reopening one, answers 409 while another is open, naming its day: "The shift of Saturday, November 7 is still open. Close it before opening another." The check and the insert run with no `await` between them in the one server process, so two stations can't both get past it. No database constraint is added.
- **Finishing an earlier shift:** `GET /api/shifts?date=` answers, when that day has no shift, an earlier shift still open. The stations show it under a red banner naming its day. Distribution and Totals work as usual. The front desk shows only the banner, so today's Families can't be typed into it. Once it closes, every station counts it as no shift and offers **Open today's shift**.
- **Not changed:** the wall display still asks for today's shift only.

## Alternatives considered

- **Let the overnight close still close it:** No morning could be blocked, but a shift would close with unresolved cards, which is what rule 1 forbids.
- **Close the other open shift automatically when one opens:** Faster, but it could close a shift someone is still working in, and it would meet rule 1 anyway.
- **A "mark the rest left and close" action for admins:** Simpler than showing an earlier shift, but it would record Families as leaving when that may not be what happened.
- **A partial unique index on open shifts:** Enforced by SQLite itself, but a database already holding two open shifts would fail to upgrade, and one process serves every request.

## Consequences

- Reports never include a closed shift with cards still waiting.
- A morning can start with yesterday's shift on screen. Distribution must resolve its cards before the front desk can begin, which the guides and the red banner explain.
- An admin can't reopen an old shift for a correction while today's is open. They close today's first, or wait until the end of the day.
- An entry queued offline before midnight still goes to its own shift, as before.
