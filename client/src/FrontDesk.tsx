import { useState } from "preact/hooks";
import { ARRIVAL_METHODS, tefapBags } from "../../server/rules.js";
import type { ArrivalMethod } from "../../server/rules.js";
import { api } from "./api.js";
import { nextCardNumber } from "./state.js";
import type { Card, ShiftWithCards, UpdateCard } from "./types.js";

export function FrontDesk(props: {
  shift: ShiftWithCards;
  onSaved: (card: Card) => void;
  onUpdate: UpdateCard;
}) {
  const { shift, onSaved, onUpdate } = props;
  const [number, setNumber] = useState("");
  const [familySize, setFamilySize] = useState("");
  const [method, setMethod] = useState<ArrivalMethod | null>(null);
  const [seniorBox, setSeniorBox] = useState(false);
  const [cheese, setCheese] = useState(false);
  const [other, setOther] = useState("");
  const [error, setError] = useState("");

  const size = Number(familySize);
  const suggested = nextCardNumber(shift.cards);

  async function submit(event: Event) {
    event.preventDefault();
    if (!method) {
      setError("Choose how the family arrived.");
      return;
    }
    setError("");
    try {
      onSaved(
        await api<Card>("POST", `/api/shifts/${shift.id}/cards`, {
          clientId: crypto.randomUUID(),
          number: Number(number) || suggested,
          familySize: size,
          arrivalMethod: method,
          seniorBox,
          cheese,
          other,
        }),
      );
      setNumber("");
      setFamilySize("");
      setMethod(null);
      setSeniorBox(false);
      setCheese(false);
      setOther("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save the card");
    }
  }

  return (
    <div class="columns">
      <form class="panel" onSubmit={submit}>
        <h2>New card</h2>
        <div class="row">
          <label>
            Card #
            <input
              type="number"
              inputmode="numeric"
              min="1"
              placeholder={String(suggested)}
              value={number}
              onInput={(e) => setNumber(e.currentTarget.value)}
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
              onInput={(e) => setFamilySize(e.currentTarget.value)}
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
                onClick={() => setMethod(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <div class="choices">
          <button
            type="button"
            class={seniorBox ? "selected" : ""}
            aria-pressed={seniorBox}
            onClick={() => setSeniorBox(!seniorBox)}
          >
            Senior box
          </button>
          <button
            type="button"
            class={cheese ? "selected" : ""}
            aria-pressed={cheese}
            onClick={() => setCheese(!cheese)}
          >
            Cheese
          </button>
        </div>

        <label>
          Other
          <input value={other} maxLength={500} onInput={(e) => setOther(e.currentTarget.value)} />
        </label>

        {error && <p class="error">{error}</p>}
        <button class="primary" type="submit">
          Save card
        </button>
      </form>

      <section class="panel">
        <h2>Cards ({shift.cards.length})</h2>
        <ul class="cards">
          {[...shift.cards].reverse().map((card) => (
            <li key={card.id}>
              <span>
                <strong>#{card.number}</strong> · family of {card.familySize} · {card.arrivalMethod}
                {card.seniorBox ? " · senior box" : ""}
                {card.cheese ? " · cheese" : ""}
              </span>
              <span class={`status ${card.status}`}>{card.status}</span>
              {card.status === "entered" && (
                <button onClick={() => onUpdate(card, { status: "called" })}>Call forward</button>
              )}
              {card.status === "called" && (
                <button onClick={() => onUpdate(card, { status: "entered" })}>Undo call</button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
