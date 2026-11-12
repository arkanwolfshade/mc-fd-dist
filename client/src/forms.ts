import {
  arrivalLabel,
  cartCount,
  isPartnerMethod,
  needsExtrasCheck,
  normalizeInitials,
  tefapBags,
} from "../../server/rules.js";
import type { ArrivalMethod, PartnerMethod } from "../../server/rules.js";
import type { QueuedWrite } from "./outbox.js";
import type { ShiftView } from "./pending.js";
import { loadsForCarts, nextCardNumber } from "./state.js";

export interface CardForm {
  number: string;
  familySize: string;
  method: ArrivalMethod | null;
  // Who the Family's details came from, chosen or typed. See ADR 0024.
  initials: string;
  // What is in the New initials box, kept apart so a quick button does not overwrite typing.
  typedInitials: string;
  seniorBox: boolean;
  cheese: boolean;
  other: string;
}

export const EMPTY_FORM: CardForm = {
  number: "",
  familySize: "",
  method: null,
  initials: "",
  typedInitials: "",
  seniorBox: false,
  cheese: false,
  other: "",
};

export function isEmpty(form: CardForm): boolean {
  return Object.entries(form).every(
    ([field, value]) => value === EMPTY_FORM[field as keyof CardForm],
  );
}

// What the front desk shows of the shift. `saving` holds the numbers of cards still being
// saved, so that the next card is not offered one of them.
export function frontDeskView(shift: ShiftView, saving: readonly number[]) {
  return {
    // Partner cards share the card stack, so they count here though the lists leave them out.
    suggested: nextCardNumber([
      ...shift.cards,
      ...shift.pendingCards,
      ...saving.map((pending) => ({ number: pending })),
    ]),
    // Door Dash and Helping Hands cards are entered at Batches, not here. See ADR 0023.
    cards: shift.cards.filter((card) => !isPartnerMethod(card.arrivalMethod)),
    pendingCards: shift.pendingCards.filter((card) => !isPartnerMethod(card.arrivalMethod)),
    knownInitials: [
      ...new Set(shift.cards.flatMap((card) => (card.intakeInitials ? [card.intakeInitials] : []))),
    ].sort(),
  };
}

export interface SavedCard {
  number: number;
  familySize: number;
  arrivalMethod: ArrivalMethod;
  seniorBox: boolean;
  cheese: boolean;
}

export type PreparedCard =
  | { ok: false; error: string }
  | {
      ok: true;
      cardNumber: number;
      label: string;
      write: Omit<QueuedWrite, "id">;
      // What is confirmed under the form once the card is saved.
      saved: SavedCard;
    };

// Checks what the volunteer entered and builds the write that saves it.
export function prepareCard(form: CardForm, shiftId: number, suggested: number): PreparedCard {
  const { method, familySize, seniorBox, cheese, other } = form;
  if (!method) {
    return { ok: false, error: "Choose the Family's location or transport." };
  }
  const intakeInitials = normalizeInitials(form.initials);
  if (!intakeInitials) {
    return { ok: false, error: "Choose who the Family's details came from." };
  }
  const size = Number(familySize);
  const cardNumber = Number(form.number) || suggested;
  const label = `Card ${cardNumber} (Family of ${size}, ${method})`;
  return {
    ok: true,
    cardNumber,
    label,
    write: {
      kind: "card-create",
      method: "POST",
      url: `/api/shifts/${shiftId}/cards`,
      body: {
        clientId: crypto.randomUUID(),
        number: cardNumber,
        familySize: size,
        arrivalMethod: method,
        intakeInitials,
        seniorBox,
        cheese,
        other,
      },
      label,
    },
    saved: { number: cardNumber, familySize: size, arrivalMethod: method, seniorBox, cheese },
  };
}

export interface PartnerForm {
  partner: PartnerMethod | null;
  number: string;
  familySize: string;
  seniorBox: boolean;
  cheese: boolean;
  extrasAdded: boolean;
  extrasNote: string;
  loads: string[];
}

export const EMPTY_PARTNER_FORM: PartnerForm = {
  partner: null,
  number: "",
  familySize: "",
  seniorBox: false,
  cheese: false,
  extrasAdded: false,
  extrasNote: "",
  loads: ["", "", ""],
};

// What a family size means for the form: how many bags and carts, and whether Distribution
// checks that extras were added.
function partnerSizing(familySize: string) {
  const size = Number(familySize);
  const bags = size > 0 ? tefapBags(size) : 0;
  return {
    size,
    bags,
    carts: size > 0 ? cartCount({ tefapBags: bags }) : 0,
    checkExtras: size > 0 && needsExtrasCheck(size),
  };
}

// What the partner form shows of the form and the shift.
export function partnerFormView(form: PartnerForm, shift: ShiftView) {
  const partnerCards = shift.cards.filter((card) => isPartnerMethod(card.arrivalMethod));
  const pendingPartnerCards = shift.pendingCards.filter((card) =>
    isPartnerMethod(card.arrivalMethod),
  );
  return {
    ...partnerSizing(form.familySize),
    // Partner cards come from the same card stack as the front desk's.
    suggested: nextCardNumber([...shift.cards, ...shift.pendingCards]),
    partnerCards,
    pendingPartnerCards,
    count: partnerCards.length + pendingPartnerCards.length,
  };
}

export type PreparedPartnerCard =
  { ok: false; error: string } | { ok: true; write: Omit<QueuedWrite, "id"> };

// Checks what the volunteer entered and builds the write that saves it.
export function preparePartnerCard(form: PartnerForm, shiftId: number): PreparedPartnerCard {
  const { partner, seniorBox, cheese, extrasAdded, extrasNote } = form;
  if (!partner) {
    return { ok: false, error: "Choose a partner." };
  }
  const { size, carts, checkExtras } = partnerSizing(form.familySize);
  const cardNumber = Number(form.number);
  return {
    ok: true,
    write: {
      kind: "card-create",
      method: "POST",
      url: `/api/shifts/${shiftId}/cards`,
      body: {
        clientId: crypto.randomUUID(),
        number: cardNumber,
        familySize: size,
        arrivalMethod: partner,
        seniorBox,
        cheese,
        other: "",
        // Only the carts this Family gets are shown, so any others are sent empty.
        loads: loadsForCarts(form.loads, carts),
        ...(checkExtras ? { extrasAdded, extrasNote } : {}),
      },
      label: `${arrivalLabel(partner)} card ${cardNumber}`,
    },
  };
}
