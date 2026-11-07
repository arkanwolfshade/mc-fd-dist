import { useState } from "preact/hooks";
import { ARRIVAL_METHODS } from "../../server/rules.js";
import type { ArrivalMethod } from "../../server/rules.js";
import { PartnerBatches, ReturnedBatches } from "./Batches.js";
import { distributionQueue, hasWeight, parseLoads } from "./state.js";
import type { Card, ShiftWithCards, UpdateCard } from "./types.js";

export function Distribution(props: {
  shift: ShiftWithCards;
  onUpdate: UpdateCard;
  onCloseShift: () => void;
}) {
  const { shift, onUpdate, onCloseShift } = props;
  const [confirmClose, setConfirmClose] = useState(false);
  const { cards } = shift;
  const queue = distributionQueue(cards);
  const done = cards.filter((card) => card.status === "distributed");

  return (
    <div class="columns">
      <section class="panel">
        <h2>Queue ({queue.length})</h2>
        {queue.length === 0 && <p class="notice">No families are waiting.</p>}
        <ul class="cards">
          {queue.map((card) => (
            <QueueCard key={card.id} card={card} onUpdate={onUpdate} />
          ))}
        </ul>
      </section>

      <section class="panel">
        <h2>Distributed ({done.length})</h2>
        <ul class="cards">
          {[...done].reverse().map((card) => (
            <li key={card.id}>
              <span>
                <strong>#{card.number}</strong> · family of {card.familySize} · {hasWeight(card.loads) ? `${card.totalWeight} lb` : "no weight"}
              </span>
              <button onClick={() => onUpdate(card, { status: "confirmed" })}>Undo</button>
            </li>
          ))}
        </ul>
      </section>

      <ReturnedBatches shift={shift} />
      <PartnerBatches shift={shift} />

      <section class="panel">
        <h2>Finish</h2>
        {confirmClose ? (
          <div class="confirm">
            <p>Close this shift? Only an admin can reopen it.</p>
            <div class="choices">
              <button onClick={onCloseShift}>Yes, close the shift</button>
              <button class="primary" onClick={() => setConfirmClose(false)}>
                Keep it open
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmClose(true)}>Close shift</button>
        )}
      </section>
    </div>
  );
}

function QueueCard(props: { card: Card; onUpdate: UpdateCard }) {
  const { card, onUpdate } = props;
  const [loads, setLoads] = useState(card.loads.map((load) => (load === null ? "" : String(load))));
  const [correcting, setCorrecting] = useState(false);
  const [confirmNoWeight, setConfirmNoWeight] = useState(false);

  function markDistributed() {
    const parsed = parseLoads(loads);
    if (!hasWeight(parsed)) {
      setConfirmNoWeight(true);
      return;
    }
    void onUpdate(card, { loads: parsed, status: "distributed" });
  }

  return (
    <li class="queue-card">
      <div>
        <strong>#{card.number}</strong> · family of {card.familySize} · {card.arrivalMethod}
        {card.seniorBox ? " · senior box" : ""}
        {card.cheese ? " · cheese" : ""} · TEFAP {card.tefapBags}
        {card.other ? ` · ${card.other}` : ""}
        <span class={`status ${card.status}`}>{card.status}</span>
      </div>

      {card.status === "called" && (
        <div class="choices">
          <button class="primary" onClick={() => onUpdate(card, { status: "confirmed" })}>
            Confirm
          </button>
          <button onClick={() => setCorrecting(!correcting)}>Correct details</button>
        </div>
      )}

      {card.status === "confirmed" && (
        <>
          <div class="row">
            {loads.map((load, index) => (
              <label key={index}>
                Load {index + 1} (lb)
                <input
                  type="number"
                  inputmode="decimal"
                  min="0"
                  step="any"
                  value={load}
                  onInput={(e) => {
                    const value = e.currentTarget.value;
                    setLoads(loads.map((old, i) => (i === index ? value : old)));
                  }}
                />
              </label>
            ))}
          </div>
          <div class="choices">
            <button class="primary" onClick={markDistributed}>
              Mark distributed
            </button>
            <button onClick={() => onUpdate(card, { status: "called" })}>Undo confirm</button>
            <button onClick={() => setCorrecting(!correcting)}>Correct details</button>
          </div>
          {confirmNoWeight && (
            <div class="confirm">
              <p>No weight entered. Mark distributed anyway?</p>
              <div class="choices">
                <button onClick={() => onUpdate(card, { status: "distributed" })}>
                  Yes, no weight
                </button>
                <button class="primary" onClick={() => setConfirmNoWeight(false)}>
                  Go back and enter weight
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {correcting && <CorrectDetails card={card} onUpdate={onUpdate} onDone={() => setCorrecting(false)} />}
    </li>
  );
}

function CorrectDetails(props: { card: Card; onUpdate: UpdateCard; onDone: () => void }) {
  const { card, onUpdate, onDone } = props;
  const [familySize, setFamilySize] = useState(String(card.familySize));
  const [method, setMethod] = useState<ArrivalMethod>(card.arrivalMethod);
  const [seniorBox, setSeniorBox] = useState(card.seniorBox);
  const [cheese, setCheese] = useState(card.cheese);

  return (
    <div class="correct">
      <label>
        # in family
        <input
          type="number"
          inputmode="numeric"
          min="1"
          value={familySize}
          onInput={(e) => setFamilySize(e.currentTarget.value)}
        />
      </label>
      <div class="choices">
        {ARRIVAL_METHODS.map((option) => (
          <button
            key={option}
            class={method === option ? "selected" : ""}
            aria-pressed={method === option}
            onClick={() => setMethod(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div class="choices">
        <button
          class={seniorBox ? "selected" : ""}
          aria-pressed={seniorBox}
          onClick={() => setSeniorBox(!seniorBox)}
        >
          Senior box
        </button>
        <button
          class={cheese ? "selected" : ""}
          aria-pressed={cheese}
          onClick={() => setCheese(!cheese)}
        >
          Cheese
        </button>
      </div>
      <button
        class="primary"
        onClick={async () => {
          await onUpdate(card, {
            familySize: Number(familySize),
            arrivalMethod: method,
            seniorBox,
            cheese,
          });
          onDone();
        }}
      >
        Save correction
      </button>
    </div>
  );
}
