import { tefapBags } from "../../server/rules.js";
import { roundWeight } from "../../server/summary.js";
import type { QueuedWrite } from "./outbox.js";
import type { Card, CardChanges, ShiftWithCards } from "./types.js";

export interface PendingCard {
  id: string;
  number: number;
  familySize: number;
  arrivalMethod: string;
  seniorBox: boolean;
  cheese: boolean;
  tefapBags: number;
}

export interface ShiftView extends ShiftWithCards {
  pendingCards: PendingCard[];
  pendingReturned: { id: string; weight: number }[];
  pendingPartners: { id: string; partner: string; familyCount: number; weight: number }[];
}

function applyChange(card: Card, body: Record<string, unknown>): Card {
  const { revision: _revision, ...rest } = body;
  const changes = rest as CardChanges;
  const familySize = changes.familySize ?? card.familySize;
  const loads = changes.loads
    ? ([changes.loads[0] ?? null, changes.loads[1] ?? null, changes.loads[2] ?? null] as Card["loads"])
    : card.loads;
  const tefapOverride =
    changes.tefapBags === undefined ? card.tefapOverride : changes.tefapBags !== null;

  return {
    ...card,
    ...(changes as Partial<Card>),
    familySize,
    loads,
    totalWeight: roundWeight(loads.reduce<number>((sum, load) => sum + (load ?? 0), 0)),
    tefapOverride,
    tefapBags: tefapOverride ? (changes.tefapBags ?? card.tefapBags) : tefapBags(familySize),
  };
}

// What a station should show: the server's state plus writes still waiting to send.
export function withPending(shift: ShiftWithCards, items: readonly QueuedWrite[]): ShiftView {
  const view: ShiftView = {
    ...shift,
    cards: shift.cards,
    pendingCards: [],
    pendingReturned: [],
    pendingPartners: [],
  };

  for (const item of items) {
    const body = item.body;
    if (item.kind === "card-update" && item.cardId !== undefined) {
      view.cards = view.cards.map((card) =>
        card.id === item.cardId ? applyChange(card, body) : card,
      );
    } else if (item.kind === "card-create") {
      const familySize = body.familySize as number;
      view.pendingCards.push({
        id: item.id,
        number: body.number as number,
        familySize,
        arrivalMethod: body.arrivalMethod as string,
        seniorBox: Boolean(body.seniorBox),
        cheese: Boolean(body.cheese),
        tefapBags: tefapBags(familySize),
      });
    } else if (item.kind === "returned") {
      view.pendingReturned.push({ id: item.id, weight: body.weight as number });
    } else if (item.kind === "partner") {
      view.pendingPartners.push({
        id: item.id,
        partner: body.partner as string,
        familyCount: body.familyCount as number,
        weight: body.weight as number,
      });
    }
  }
  return view;
}
