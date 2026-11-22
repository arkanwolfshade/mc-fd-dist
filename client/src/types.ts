import type { Role, WorkingRole } from "../../server/accounts.js";
import type { ReturnedBatch } from "../../server/batches.js";
import type { Outbox } from "./outbox.js";
import type { Card, CardChanges, Shift } from "../../server/cards.js";

export type { Card, CardChanges, ReturnedBatch, Shift };

export interface Identity {
  username: string;
  role: Role;
}

// Someone signed in at a station, as opposed to the wall display.
export interface StationIdentity extends Identity {
  role: WorkingRole;
}

export type ShiftWithCards = Shift & {
  cards: Card[];
  returnedBatches: ReturnedBatch[];
};

export type Submit = Outbox["submit"];

// Sends a change to one card. The parent handles stale writes and shows errors.
export type UpdateCard = (card: Card, changes: CardChanges) => Promise<void>;
