import { useState } from "preact/hooks";
import {
  arrivalLabel,
  cartCount,
  isPartnerMethod,
  needsExtrasCheck,
  PARTNER_METHODS,
  tefapBags,
} from "../../server/rules.js";
import type { PartnerMethod } from "../../server/rules.js";
import { roundWeight } from "../../server/summary.js";
import { api, errorText } from "./api.js";
import { familyLabel, Ticket } from "./CardActions.js";
import type { ShiftView } from "./pending.js";
import { loadsForCarts, nextCardNumber, toggleSeniorBox } from "./state.js";
import type { Card, Submit } from "./types.js";

function totalWeight(loads: readonly (number | null)[]): number {
  return roundWeight(loads.reduce<number>((sum, load) => sum + (load ?? 0), 0));
}

export function ReturnedBatches(props: { shift: ShiftView; submit: Submit }) {
  const { shift, submit } = props;
  const [weight, setWeight] = useState("");
  const [error, setError] = useState("");

  async function add(event: Event) {
    event.preventDefault();
    setError("");
    try {
      await submit({
        kind: "returned",
        method: "POST",
        url: `/api/shifts/${shift.id}/returned-batches`,
        body: { clientId: crypto.randomUUID(), weight: Number(weight) },
        label: `Returned batch (${weight} lb)`,
      });
      setWeight("");
    } catch (failure) {
      setError(errorText(failure, "Could not save that"));
    }
  }

  async function remove(id: number) {
    setError("");
    try {
      await api("DELETE", `/api/returned-batches/${id}`);
    } catch (failure) {
      setError(errorText(failure, "Could not save that"));
    }
  }

  return (
    <section class="panel">
      <h2>Returned items ({shift.returnedBatches.length + shift.pendingReturned.length})</h2>
      <form class="row end" onSubmit={add}>
        <label>
          Weight (lb)
          <input
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            required
            value={weight}
            onInput={(e) => setWeight(e.currentTarget.value)}
          />
        </label>
        <button type="submit">Add returned weight</button>
      </form>
      {error && <p class="error">{error}</p>}
      <ul class="cards">
        {shift.returnedBatches.map((batch) => (
          <li key={batch.id}>
            <span>{batch.weight} lb</span>
            <button onClick={() => remove(batch.id)}>Remove</button>
          </li>
        ))}
        {shift.pendingReturned.map((batch) => (
          <li key={batch.id}>
            <span>{batch.weight} lb · waiting to send</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface PartnerForm {
  partner: PartnerMethod | null;
  number: string;
  familySize: string;
  seniorBox: boolean;
  cheese: boolean;
  extrasAdded: boolean;
  extrasNote: string;
  loads: string[];
}

const EMPTY_PARTNER_FORM: PartnerForm = {
  partner: null,
  number: "",
  familySize: "",
  seniorBox: false,
  cheese: false,
  extrasAdded: false,
  extrasNote: "",
  loads: ["", "", ""],
};

// Each Door Dash or Helping Hands Family is its own card, saved as distributed. They never
// pass the intake computers, so they carry no initials. See ADR 0023.
export function PartnerCards(props: {
  shift: ShiftView;
  submit: Submit;
  onSaved: (card: Card) => void;
}) {
  const { shift, submit, onSaved } = props;
  const [form, setForm] = useState<PartnerForm>(EMPTY_PARTNER_FORM);
  const [error, setError] = useState("");

  const { partner, number, familySize, seniorBox, cheese, extrasAdded, extrasNote, loads } = form;
  const size = Number(familySize);
  const bags = size > 0 ? tefapBags(size) : 0;
  const carts = size > 0 ? cartCount({ tefapBags: bags }) : 0;
  const checkExtras = size > 0 && needsExtrasCheck(size);
  // Partner cards come from the same card stack as the front desk's.
  const suggested = nextCardNumber([...shift.cards, ...shift.pendingCards]);
  const partnerCards = shift.cards.filter((card) => isPartnerMethod(card.arrivalMethod));
  const pendingPartnerCards = shift.pendingCards.filter((card) =>
    isPartnerMethod(card.arrivalMethod),
  );
  const count = partnerCards.length + pendingPartnerCards.length;

  function change(changes: Partial<PartnerForm>) {
    setForm((current) => ({ ...current, ...changes }));
  }

  async function add(event: Event) {
    event.preventDefault();
    if (!partner) {
      setError("Choose a partner.");
      return;
    }
    setError("");
    const cardNumber = Number(number);
    // Only the carts this Family gets are shown, so any others are sent empty.
    const parsed = loadsForCarts(loads, carts);
    try {
      const result = await submit({
        kind: "card-create",
        method: "POST",
        url: `/api/shifts/${shift.id}/cards`,
        body: {
          clientId: crypto.randomUUID(),
          number: cardNumber,
          familySize: size,
          arrivalMethod: partner,
          seniorBox,
          cheese,
          other: "",
          loads: parsed,
          ...(checkExtras ? { extrasAdded, extrasNote } : {}),
        },
        label: `${arrivalLabel(partner)} card ${cardNumber}`,
      });
      // Shown at once, as on the front desk, rather than waiting for the live update.
      if (result.status === "sent") {
        onSaved(result.data as Card);
      }
      setForm(EMPTY_PARTNER_FORM);
    } catch (failure) {
      setError(errorText(failure, "Could not save that"));
    }
  }

  return (
    <section class="panel">
      <h2>End of shift: Door Dash and Helping Hands ({count})</h2>
      <form class="stack" onSubmit={add}>
        <div class="choices">
          {PARTNER_METHODS.map((option) => (
            <button
              type="button"
              key={option}
              class={partner === option ? "selected" : ""}
              aria-pressed={partner === option}
              onClick={() => change({ partner: option })}
            >
              {arrivalLabel(option)}
            </button>
          ))}
        </div>
        <div class="row">
          <label>
            Card #
            <input
              type="number"
              inputmode="numeric"
              min="1"
              required
              placeholder={String(suggested)}
              value={number}
              onInput={(e) => change({ number: e.currentTarget.value })}
            />
          </label>
          <label>
            # in Family
            <input
              type="number"
              inputmode="numeric"
              min="1"
              max="100"
              required
              value={familySize}
              onInput={(e) => change({ familySize: e.currentTarget.value })}
            />
          </label>
          <div class="tefap">
            TEFAP bags
            <strong>{size > 0 ? bags : "–"}</strong>
          </div>
        </div>
        <div class="choices extras">
          <button
            type="button"
            class={seniorBox ? "selected" : ""}
            aria-pressed={seniorBox}
            onClick={() => change(toggleSeniorBox({ seniorBox, cheese }))}
          >
            Senior Box
          </button>
          <button
            type="button"
            class={cheese ? "selected" : ""}
            aria-pressed={cheese}
            disabled={!seniorBox}
            onClick={() => change({ cheese: !cheese })}
          >
            Cheese
          </button>
        </div>
        {checkExtras && (
          <ExtrasFields
            added={extrasAdded}
            note={extrasNote}
            onChange={(added, note) => change({ extrasAdded: added, extrasNote: note })}
          />
        )}
        {carts > 0 && (
          <CartFields loads={loads} carts={carts} onChange={(next) => change({ loads: next })} />
        )}
        {error && <p class="error">{error}</p>}
        <button type="submit">Add partner Family</button>
      </form>
      <ul class="cards">
        {pendingPartnerCards.map((card) => (
          <li class="card-row pending-card" key={card.id}>
            <Ticket number={card.number} />
            <span class="who">
              <strong class="family">{familyLabel(card)}</strong>
              <span class="details">{arrivalLabel(card.arrivalMethod)}</span>
            </span>
            <span class="weight">{totalWeight(card.loads)} lb</span>
            <span class="status pending">waiting to send</span>
          </li>
        ))}
        {[...partnerCards].reverse().map((card) => (
          <li class="card-row" key={card.id}>
            <Ticket number={card.number} />
            <span class="who">
              <strong class="family">{familyLabel(card)}</strong>
              <span class="details">{arrivalLabel(card.arrivalMethod)}</span>
            </span>
            <span class="weight">{card.totalWeight} lb</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// One weight for each cart the Family gets. See ADR 0023.
export function CartFields(props: {
  loads: string[];
  carts: number;
  onChange: (loads: string[]) => void;
}) {
  const { loads, carts, onChange } = props;
  return (
    <div class="row">
      {loads.slice(0, carts).map((load, index) => (
        // Carts are in a fixed order, so the position is a stable key.
        // oxlint-disable-next-line react/no-array-index-key
        <label key={index}>
          Cart {index + 1} (lb)
          <input
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            value={load}
            onInput={(e) => {
              const value = e.currentTarget.value;
              onChange(loads.map((old, i) => (i === index ? value : old)));
            }}
          />
        </label>
      ))}
    </div>
  );
}

// Families with room on their last cart get extras, such as meat, deli or bakery. See ADR 0023.
export function ExtrasFields(props: {
  added: boolean;
  note: string;
  onChange: (added: boolean, note: string) => void;
}) {
  const { added, note, onChange } = props;
  return (
    <div class="extras-check">
      <label class="check">
        <input
          type="checkbox"
          checked={added}
          onChange={(e) => onChange(e.currentTarget.checked, note)}
        />
        Extras added
      </label>
      <label>
        What was added
        <input
          maxLength={200}
          placeholder="Meat, deli, bakery…"
          value={note}
          onInput={(e) => onChange(added, e.currentTarget.value)}
        />
      </label>
    </div>
  );
}
