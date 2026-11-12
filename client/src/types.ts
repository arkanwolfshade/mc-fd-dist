import type { Role } from "../../server/accounts.js";
import type { ReturnedBatch } from "../../server/batches.js";
import type { Outbox } from "./outbox.js";
import type { Card, CardChanges, Shift } from "../../server/cards.js";

export type { Card, CardChanges, ReturnedBatch, Shift };

export interface Identity {
  username: string;
  role: Role;
}

export type ShiftWithCards = Shift & {
  cards: Card[];
  returnedBatches: ReturnedBatch[];
};

export type Submit = Outbox["submit"];

// Sends a change to one card. The parent handles stale writes and shows errors.
export type UpdateCard = (card: Card, changes: CardChanges) => Promise<void>;
