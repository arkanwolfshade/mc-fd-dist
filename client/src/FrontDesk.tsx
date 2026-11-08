import { useState } from "preact/hooks";
import { ARRIVAL_METHODS, arrivalLabel, tefapBags } from "../../server/rules.js";
import type { ArrivalMethod } from "../../server/rules.js";
import { cardDetails, DeleteCardButton, Family, StatusLabel, Ticket } from "./CardActions.js";
import type { ShiftView } from "./pending.js";
import { nextCardNumber } from "./state.js";
import type { Card, Submit, UpdateCard } from "./types.js";

interface CardForm {
  number: string;
  familySize: string;
  method: ArrivalMethod | null;
  seniorBox: boolean;
  cheese: boolean;
  other: string;
}

const EMPTY_FORM: CardForm = {
  number: "",
  familySize: "",
  method: null,
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

  const { number, familySize, method, seniorBox, cheese, other } = form;
  const size = Number(familySize);
  const suggested = nextCardNumber([
    ...shift.cards,
    ...shift.pendingCards,
    ...saving.map((pending) => ({ number: pending })),
  ]);

  function change(changes: Partial<CardForm>) {
    setForm((current) => ({ ...current, ...changes }));
  }

  async function submit(event: Event) {
    event.preventDefault();
    if (!method) {
      setError("Choose how the family arrived.");
      return;
    }
    setError("");
    const entry = form;
    const cardNumber = Number(number) || suggested;
    const label = `Card ${cardNumber} (family of ${size}, ${method})`;
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
      const reason = failure instanceof Error ? failure.message : "please try again";
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
            # in family
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
          <legend>Arrived by</legend>
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

        <div class="choices extras">
          <button
            type="button"
            class={seniorBox ? "selected" : ""}
            aria-pressed={seniorBox}
            // Cheese comes only with a senior box, so it goes when the box does.
            onClick={() =>
              change(seniorBox ? { seniorBox: false, cheese: false } : { seniorBox: true })
            }
          >
            Senior box
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
            <Ticket number={saved.number} /> Saved: family of {saved.familySize},{" "}
            {cardDetails(saved)}
          </p>
        )}
      </form>

      <section class="panel">
        <h2>Cards ({shift.cards.length})</h2>
        <ul class="cards">
          {shift.pendingCards.map((card) => (
            <li class="card-row pending-card" key={card.id}>
              <Ticket number={card.number} />
              <Family card={card} />
              <span class="status pending">waiting to send</span>
            </li>
          ))}
          {[...shift.cards].reverse().map((card) => (
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
