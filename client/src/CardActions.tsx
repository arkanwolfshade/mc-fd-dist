import { useState } from "preact/hooks";
import { arrivalLabel } from "../../server/rules.js";
import type { ArrivalMethod, CardStatus } from "../../server/rules.js";
import type { Card, UpdateCard } from "./types.js";

// The words volunteers use: the front desk calls back, distribution confirms and distributes.
const STATUS_LABELS: Record<CardStatus, string> = {
  entered: "Waiting",
  called: "Called back",
  confirmed: "Confirmed",
  distributed: "Distributed",
  left: "Left without food",
};

export function StatusLabel(props: { status: CardStatus }) {
  return <span class={`status ${props.status}`}>{STATUS_LABELS[props.status]}</span>;
}

// The Family's card number, drawn as the claim-check ticket they hold.
export function Ticket(props: { number: number; big?: boolean }) {
  return <span class={props.big ? "ticket big" : "ticket"}>{props.number}</span>;
}

export function familyLabel(card: { familySize: number }): string {
  return `Family of ${card.familySize}`;
}

// For example "Walk, Senior Box and Cheese". Cheese only ever comes with a Senior Box.
export function cardDetails(card: {
  arrivalMethod: ArrivalMethod;
  seniorBox: boolean;
  cheese: boolean;
}): string {
  const extras = card.cheese ? " and Cheese" : "";
  return `${arrivalLabel(card.arrivalMethod)}${card.seniorBox ? `, Senior Box${extras}` : ""}`;
}

// Who at the front desk took the Family's details. See ADR 0024.
export function InfoFrom(props: { initials: string | null }) {
  if (!props.initials) return null;
  return <span class="info-from">Info from {props.initials}</span>;
}

// Name and details stacked, as each row and card shows them.
export function Family(props: {
  card: { familySize: number; arrivalMethod: ArrivalMethod; seniorBox: boolean; cheese: boolean };
}) {
  return (
    <span class="who">
      <strong class="family">{familyLabel(props.card)}</strong>
      <span class="details">{cardDetails(props.card)}</span>
    </span>
  );
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
