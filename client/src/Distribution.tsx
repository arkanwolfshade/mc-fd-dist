import { useState } from "preact/hooks";
import {
  ARRIVAL_METHODS,
  arrivalLabel,
  cartCount,
  isPartnerMethod,
  needsExtrasCheck,
} from "../../server/rules.js";
import type { ArrivalMethod } from "../../server/rules.js";
import { CartFields, ExtrasFields, PartnerCards, ReturnedBatches } from "./Batches.js";
import {
  DeleteCardButton,
  Family,
  familyLabel,
  InfoFrom,
  LeftWithoutFoodButton,
  StatusLabel,
  Ticket,
} from "./CardActions.js";
import type { ShiftView } from "./pending.js";
import {
  distributionLists,
  hasWeight,
  loadsForCarts,
  missingBeforeDistribution,
  parseLoads,
  toggleSeniorBox,
} from "./state.js";
import type { Card, Submit, UpdateCard } from "./types.js";

function distributedDetails(card: Card): string {
  const weight = hasWeight(card.loads) ? `${card.totalWeight} lb` : "no weight";
  if (!card.extrasAdded) return weight;
  return `${weight} · ${card.extrasNote ? `Extras: ${card.extrasNote}` : "Extras added"}`;
}

export function Distribution(props: {
  shift: ShiftView;
  submit: Submit;
  onSaved: (card: Card) => void;
  onUpdate: UpdateCard;
  // Given only to admins.
  onDelete: ((card: Card) => void) | undefined;
  onCloseShift: () => void;
}) {
  const { shift, submit, onSaved, onUpdate, onDelete, onCloseShift } = props;
  const [confirmClose, setConfirmClose] = useState(false);
  const { cards } = shift;
  const { queue, done, left, unserved } = distributionLists(cards);

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
                <span class="details">{distributedDetails(card)}</span>
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
      <PartnerCards shift={shift} submit={submit} onSaved={onSaved} />

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
  // Always three, as stored; only the carts this Family gets are shown. See ADR 0023.
  const [loads, setLoads] = useState(card.loads.map((load) => (load === null ? "" : String(load))));
  const [extrasAdded, setExtrasAdded] = useState(card.extrasAdded);
  const [extrasNote, setExtrasNote] = useState(card.extrasNote);
  const [correcting, setCorrecting] = useState(false);
  // What the volunteer is warned about before marking the Family distributed anyway.
  const [missing, setMissing] = useState<string[]>([]);
  const carts = cartCount(card);

  function distribute() {
    const parsed = loadsForCarts(loads, carts);
    void onUpdate(card, { loads: parsed, extrasAdded, extrasNote, status: "distributed" });
  }

  function markDistributed() {
    const found = missingBeforeDistribution(card, parseLoads(loads), extrasAdded);
    if (found.length > 0) {
      setMissing(found);
      return;
    }
    distribute();
  }

  return (
    <li class="queue-card">
      <div class="queue-head">
        <Ticket number={card.number} big />
        <Family card={card} />
        <InfoFrom initials={card.intakeInitials} />
        <StatusLabel status={card.status} />
      </div>
      {/* What to hand over is the point of the card, so it has its own line. */}
      <div class="give">
        <span class="give-label">Give</span>
        <ul>
          <li>
            {card.tefapBags} TEFAP {card.tefapBags === 1 ? "bag" : "bags"}
          </li>
          {card.seniorBox && <li>Senior Box</li>}
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

      {/* The weights and extras live here, not in ConfirmedCard, so that undoing the
          confirmation does not lose what was typed. */}
      {card.status === "confirmed" && (
        <ConfirmedCard
          card={card}
          carts={carts}
          loads={loads}
          extrasAdded={extrasAdded}
          extrasNote={extrasNote}
          missing={missing}
          onLoads={(next) => {
            setLoads(next);
            setMissing([]);
          }}
          onExtras={(added, note) => {
            setExtrasAdded(added);
            setExtrasNote(note);
            setMissing([]);
          }}
          onMarkDistributed={markDistributed}
          onDistributeAnyway={distribute}
          onGoBack={() => setMissing([])}
          onUndoConfirm={() => onUpdate(card, { status: "called" })}
          onCorrect={() => setCorrecting(!correcting)}
        />
      )}

      {correcting && (
        <CorrectDetails card={card} onUpdate={onUpdate} onDone={() => setCorrecting(false)} />
      )}
    </li>
  );
}

interface ConfirmedCardProps {
  card: Card;
  carts: number;
  loads: string[];
  extrasAdded: boolean;
  extrasNote: string;
  missing: string[];
  onLoads: (loads: string[]) => void;
  onExtras: (added: boolean, note: string) => void;
  onMarkDistributed: () => void;
  onDistributeAnyway: () => void;
  onGoBack: () => void;
  onUndoConfirm: () => void;
  onCorrect: () => void;
}

// What Distribution fills in once a card is confirmed: the weight of each cart and the extras.
function ConfirmedCard(props: ConfirmedCardProps) {
  const { card, missing } = props;
  return (
    <>
      <CartFields loads={props.loads} carts={props.carts} onChange={props.onLoads} />
      {needsExtrasCheck(card.familySize) && (
        <ExtrasFields added={props.extrasAdded} note={props.extrasNote} onChange={props.onExtras} />
      )}
      <div class="choices">
        <button class="primary" onClick={props.onMarkDistributed}>
          Mark distributed
        </button>
        <button onClick={props.onUndoConfirm}>Undo confirm</button>
        <button onClick={props.onCorrect}>Correct details</button>
      </div>
      {missing.length > 0 && (
        <div class="confirm">
          {missing.map((message) => (
            <p key={message}>{message}</p>
          ))}
          <div class="choices">
            <button onClick={props.onDistributeAnyway}>Mark distributed anyway</button>
            <button class="primary" onClick={props.onGoBack}>
              Go back
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function CorrectDetails(props: { card: Card; onUpdate: UpdateCard; onDone: () => void }) {
  const { card, onUpdate, onDone } = props;
  const [familySize, setFamilySize] = useState(String(card.familySize));
  const [method, setMethod] = useState<ArrivalMethod>(card.arrivalMethod);
  const [seniorBox, setSeniorBox] = useState(card.seniorBox);
  const [cheese, setCheese] = useState(card.cheese);
  // A partner card stays with its partner: the front desk's choices don't apply to it.
  const isPartner = isPartnerMethod(card.arrivalMethod);

  return (
    <div class="correct">
      <label>
        # in Family
        <input
          type="number"
          inputmode="numeric"
          min="1"
          value={familySize}
          onInput={(e) => setFamilySize(e.currentTarget.value)}
        />
      </label>
      {!isPartner && (
        <fieldset>
          <legend>Location or transport</legend>
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
        </fieldset>
      )}
      <div class="choices">
        <button
          class={seniorBox ? "selected" : ""}
          aria-pressed={seniorBox}
          onClick={() => {
            const next = toggleSeniorBox({ seniorBox, cheese });
            setSeniorBox(next.seniorBox);
            setCheese(next.cheese);
          }}
        >
          Senior Box
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
