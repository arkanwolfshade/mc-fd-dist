import { useState } from "preact/hooks";
import type { CardStatus } from "../../server/rules.js";
import type { Card, UpdateCard } from "./types.js";

const STATUS_LABELS: Record<CardStatus, string> = {
  entered: "entered",
  called: "called back",
  confirmed: "confirmed",
  distributed: "distributed",
  left: "left without food",
};

export function StatusLabel(props: { status: CardStatus }) {
  return <span class={`status ${props.status}`}>{STATUS_LABELS[props.status]}</span>;
}

// A button that asks once more before doing something hard to take back.
function ConfirmButton(props: { label: string; question: string; yes: string; onYes: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button onClick={() => setAsking(true)}>{props.label}</button>;
  }
  return (
    <span class="ask">
      <span>{props.question}</span>
      <button
        onClick={() => {
          setAsking(false);
          props.onYes();
        }}
      >
        {props.yes}
      </button>
      <button class="primary" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  );
}

// Recorded instead of serving the family, so they count only on their own line. See ADR 0019.
export function LeftWithoutFoodButton(props: { card: Card; onUpdate: UpdateCard }) {
  const { card, onUpdate } = props;
  return (
    <ConfirmButton
      label="Left without food"
      question={`Record #${card.number} as left without food?`}
      yes="Yes, left without food"
      onYes={() => void onUpdate(card, { status: "left" })}
    />
  );
}

export function DeleteCardButton(props: { card: Card; onDelete: (card: Card) => void }) {
  const { card, onDelete } = props;
  return (
    <ConfirmButton
      label="Delete"
      question={`Delete card #${card.number}? This cannot be undone.`}
      yes="Yes, delete"
      onYes={() => onDelete(card)}
    />
  );
}
