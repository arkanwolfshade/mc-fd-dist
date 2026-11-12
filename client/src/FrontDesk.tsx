import { useState } from "preact/hooks";
import {
  ARRIVAL_METHODS,
  arrivalLabel,
  isPartnerMethod,
  normalizeInitials,
  tefapBags,
} from "../../server/rules.js";
import type { ArrivalMethod } from "../../server/rules.js";
import { errorText } from "./api.js";
import { cardDetails, DeleteCardButton, Family, StatusLabel, Ticket } from "./CardActions.js";
import type { ShiftView } from "./pending.js";
import { nextCardNumber } from "./state.js";
import type { Card, Submit, UpdateCard } from "./types.js";

interface CardForm {
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

const EMPTY_FORM: CardForm = {
  number: "",
  familySize: "",
  method: null,
  initials: "",
  typedInitials: "",
  seniorBox: false,
  cheese: false,
  other: "",
};

function isEmpty(form: CardForm): boolean {
  return Object.entries(form).every(
    ([field, value]) => value === EMPTY_FORM[field as keyof CardForm],
  );
}

export function FrontDesk(props: {
  shift: ShiftView;
  submit: Submit;
  onSaved: (card: Card) => void;
  onUpdate: UpdateCard;
  // Given only to admins.
  onDelete: ((card: Card) => void) | undefined;
}) {
  const { shift, submit: submitWrite, onSaved, onUpdate, onDelete } = props;
  const [form, setForm] = useState<CardForm>(EMPTY_FORM);
  // Numbers still being saved, so that the next card is not offered one of them.
  const [saving, setSaving] = useState<number[]>([]);
  const [error, setError] = useState("");
  // The last card saved, confirmed under the form.
  const [saved, setSaved] = useState<{
    number: number;
    familySize: number;
    arrivalMethod: ArrivalMethod;
    seniorBox: boolean;
    cheese: boolean;
  } | null>(null);

  const { number, familySize, method, initials, typedInitials, seniorBox, cheese, other } = form;
  const size = Number(familySize);
  // Partner cards share the card stack, so they count here though the list leaves them out.
  const suggested = nextCardNumber([
    ...shift.cards,
    ...shift.pendingCards,
    ...saving.map((pending) => ({ number: pending })),
  ]);
  // Door Dash and Helping Hands cards are entered at Batches, not here. See ADR 0023.
  const cards = shift.cards.filter((card) => !isPartnerMethod(card.arrivalMethod));
  const pendingCards = shift.pendingCards.filter((card) => !isPartnerMethod(card.arrivalMethod));
  const knownInitials = [
    ...new Set(shift.cards.flatMap((card) => (card.intakeInitials ? [card.intakeInitials] : []))),
  ].sort();

  function change(changes: Partial<CardForm>) {
    setForm((current) => ({ ...current, ...changes }));
  }

  async function submit(event: Event) {
    event.preventDefault();
    if (!method) {
      setError("Choose the Family's location or transport.");
      return;
    }
    const intakeInitials = normalizeInitials(initials);
    if (!intakeInitials) {
      setError("Choose who the Family's details came from.");
      return;
    }
    setError("");
    const entry = form;
    const cardNumber = Number(number) || suggested;
    const label = `Card ${cardNumber} (Family of ${size}, ${method})`;
    // Cleared at once, so that the next family can be typed while this card saves.
    setForm(EMPTY_FORM);
    setSaving((current) => [...current, cardNumber]);
    try {
      const result = await submitWrite({
        kind: "card-create",
        method: "POST",
        url: `/api/shifts/${shift.id}/cards`,
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
      });
      if (result.status === "sent") {
        onSaved(result.data as Card);
      }
      setSaved({ number: cardNumber, familySize: size, arrivalMethod: method, seniorBox, cheese });
    } catch (failure) {
      setSaved(null);
      const reason = errorText(failure, "please try again");
      setError(`${label} was not saved: ${reason}`);
      // The details come back for correction, unless the next family is already being typed.
      setForm((current) => (isEmpty(current) ? entry : current));
    } finally {
      setSaving((current) => {
        const index = current.indexOf(cardNumber);
        return current.filter((_, position) => position !== index);
      });
    }
  }

  return (
    <div class="columns">
      <form class="panel" onSubmit={submit}>
        <h2>New card</h2>
        {/* The number the card will be saved with, as the ticket in the family's hand. */}
        <div class="next-card">
          <Ticket number={Number(number) || suggested} big />
          <span class="hint">
            {number
              ? "Card number typed below"
              : "Next card number. Type another below to change it."}
          </span>
        </div>
        <div class="row">
          <label>
            Card #
            <input
              type="number"
              inputmode="numeric"
              min="1"
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
            <strong>{size > 0 ? tefapBags(size) : "–"}</strong>
          </div>
        </div>

        <fieldset>
          <legend>Location or transport</legend>
          <div class="choices">
            {ARRIVAL_METHODS.map((option) => (
              <button
                type="button"
                key={option}
                class={method === option ? "selected" : ""}
                aria-pressed={method === option}
                onClick={() => change({ method: option })}
              >
                {arrivalLabel(option)}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Chosen afresh for each card, since volunteers take turns at intake. See ADR 0024. */}
        <fieldset>
          <legend>Info from</legend>
          <div class="info-from">
            <div class="choices">
              {knownInitials.map((option) => (
                <button
                  type="button"
                  key={option}
                  class={initials === option ? "selected" : ""}
                  aria-pressed={initials === option}
                  onClick={() => change({ initials: option, typedInitials: "" })}
                >
                  {option}
                </button>
              ))}
            </div>
            <label>
              New initials
              <input
                value={typedInitials}
                maxLength={4}
                autocapitalize="characters"
                autocomplete="off"
                onInput={(e) => {
                  const typed = e.currentTarget.value;
                  change({ typedInitials: typed, initials: typed.trim().toUpperCase() });
                }}
              />
            </label>
          </div>
        </fieldset>

        <div class="choices extras">
          <button
            type="button"
            class={seniorBox ? "selected" : ""}
            aria-pressed={seniorBox}
            // Cheese comes only with a Senior Box, so it goes when the box does.
            onClick={() =>
              change(seniorBox ? { seniorBox: false, cheese: false } : { seniorBox: true })
            }
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

        <label>
          Other
          <input
            value={other}
            maxLength={500}
            onInput={(e) => change({ other: e.currentTarget.value })}
          />
        </label>

        {error && <p class="error">{error}</p>}
        <button class="primary" type="submit">
          Save card {Number(number) || suggested}
        </button>
        {saved && (
          <p class="saved" role="status">
            <Ticket number={saved.number} /> Saved: Family of {saved.familySize},{" "}
            {cardDetails(saved)}
          </p>
        )}
      </form>

      <section class="panel">
        <h2>Cards ({cards.length})</h2>
        <ul class="cards">
          {pendingCards.map((card) => (
            <li class="card-row pending-card" key={card.id}>
              <Ticket number={card.number} />
              <Family card={card} />
              <span class="status pending">waiting to send</span>
            </li>
          ))}
          {[...cards].reverse().map((card) => (
            <li class="card-row" key={card.id}>
              <Ticket number={card.number} />
              <Family card={card} />
              <StatusLabel status={card.status} />
              <span class="row-actions">
                {/* "Call back" is the radio call to distribution. */}
                {card.status === "entered" && (
                  <button onClick={() => onUpdate(card, { status: "called" })}>Call back</button>
                )}
                {card.status === "called" && (
                  <button onClick={() => onUpdate(card, { status: "entered" })}>
                    Undo call back
                  </button>
                )}
                {onDelete && <DeleteCardButton card={card} onDelete={onDelete} />}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
