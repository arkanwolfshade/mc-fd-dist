import { useState } from "preact/hooks";
import { ARRIVAL_METHODS, arrivalLabel } from "../../server/rules.js";
import type { ArrivalMethod } from "../../server/rules.js";
import { PartnerBatches, ReturnedBatches } from "./Batches.js";
import {
  DeleteCardButton,
  Family,
  familyLabel,
  LeftWithoutFoodButton,
  StatusLabel,
  Ticket,
} from "./CardActions.js";
import type { ShiftView } from "./pending.js";
import { distributionQueue, hasWeight, parseLoads } from "./state.js";
import type { Card, Submit, UpdateCard } from "./types.js";

export function Distribution(props: {
  shift: ShiftView;
  submit: Submit;
  onUpdate: UpdateCard;
  // Given only to admins.
  onDelete: ((card: Card) => void) | undefined;
  onCloseShift: () => void;
}) {
  const { shift, submit, onUpdate, onDelete, onCloseShift } = props;
  const [confirmClose, setConfirmClose] = useState(false);
  const { cards } = shift;
  const queue = distributionQueue(cards);
  const done = cards.filter((card) => card.status === "distributed");
  const left = cards.filter((card) => card.status === "left");
  // Still counted as families, but at the end of a shift each one needs correcting.
  const unserved = cards.filter((card) => card.status !== "distributed" && card.status !== "left");

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
            <li class="card-row" key={card.id}>
              <Ticket number={card.number} />
              <span class="who">
                <strong class="family">{familyLabel(card)}</strong>
                <span class="details">
                  {hasWeight(card.loads) ? `${card.totalWeight} lb` : "no weight"}
                </span>
              </span>
              <span class="row-actions">
                <button onClick={() => onUpdate(card, { status: "confirmed" })}>Undo</button>
              </span>
            </li>
          ))}
          {left.map((card) => (
            <li class="card-row" key={card.id}>
              <Ticket number={card.number} />
              <Family card={card} />
              <StatusLabel status={card.status} />
              <span class="row-actions">
                <button onClick={() => onUpdate(card, { status: "entered" })}>Undo</button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <ReturnedBatches shift={shift} submit={submit} />
      <PartnerBatches shift={shift} submit={submit} />

      <section class="panel">
        <h2>Finish</h2>
        {confirmClose ? (
          <div class="confirm">
            {unserved.length > 0 && (
              <>
                <p>
                  {unserved.length} {unserved.length === 1 ? "card has" : "cards have"} not been
                  marked distributed. Correct {unserved.length === 1 ? "it" : "them"} before
                  closing:
                </p>
                <ul class="unserved">
                  {unserved.map((card) => (
                    <li key={card.id}>
                      <span class="unserved-card">
                        <Ticket number={card.number} />
                        <span class="family">{familyLabel(card)}</span>
                        <StatusLabel status={card.status} />
                      </span>
                      <span class="choices">
                        <LeftWithoutFoodButton card={card} onUpdate={onUpdate} />
                        {onDelete && <DeleteCardButton card={card} onDelete={onDelete} />}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
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
      <div class="queue-head">
        <Ticket number={card.number} big />
        <Family card={card} />
        <StatusLabel status={card.status} />
      </div>
      {/* What to hand over is the point of the card, so it has its own line. */}
      <div class="give">
        <span class="give-label">Give</span>
        <ul>
          <li>
            {card.tefapBags} TEFAP {card.tefapBags === 1 ? "bag" : "bags"}
          </li>
          {card.seniorBox && <li>Senior box</li>}
          {card.cheese && <li>Cheese</li>}
        </ul>
      </div>
      {card.other && (
        <p class="note-from-desk">
          <strong>Note from the front desk:</strong> {card.other}
        </p>
      )}

      {/* Confirming answers the front desk's call back, once the number and details match. */}
      {card.status === "called" && (
        <div class="choices">
          <button class="primary" onClick={() => onUpdate(card, { status: "confirmed" })}>
            Confirm card {card.number}
          </button>
          <button onClick={() => setCorrecting(!correcting)}>Correct details</button>
        </div>
      )}

      {card.status === "confirmed" && (
        <>
          <div class="row">
            {loads.map((load, index) => (
              // Always three loads in a fixed order, so the position is a stable key.
              // oxlint-disable-next-line react/no-array-index-key
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

      {correcting && (
        <CorrectDetails card={card} onUpdate={onUpdate} onDone={() => setCorrecting(false)} />
      )}
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
            {arrivalLabel(option)}
          </button>
        ))}
      </div>
      <div class="choices">
        <button
          class={seniorBox ? "selected" : ""}
          aria-pressed={seniorBox}
          onClick={() => {
            // Cheese comes only with a senior box, so it goes when the box does.
            if (seniorBox) setCheese(false);
            setSeniorBox(!seniorBox);
          }}
        >
          Senior box
        </button>
        <button
          class={cheese ? "selected" : ""}
          aria-pressed={cheese}
          disabled={!seniorBox}
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
