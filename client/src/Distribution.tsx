import { useRef, useState } from "preact/hooks";
import {
  ARRIVAL_METHODS,
  arrivalLabel,
  cartCount,
  isPartnerMethod,
  needsExtrasCheck,
  waitingCardsRule,
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
import { afterRender, ScreenReaderText } from "./Controls.js";
import { HelpPopout } from "./HelpPopout.js";
import type { ShiftView } from "./pending.js";
import {
  distributionLists,
  hasWeight,
  loadsForCarts,
  checkBeforeDistribution,
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
  // Asking moves focus to "Keep it open", the safe answer; keeping it open puts it back.
  const closeButton = useRef<HTMLButtonElement>(null);
  const keepOpen = useRef<HTMLButtonElement>(null);
  function askToClose(asking: boolean) {
    setConfirmClose(asking);
    afterRender(() => (asking ? keepOpen : closeButton).current?.focus());
  }
  const { cards } = shift;
  const { queue, done, left, unserved } = distributionLists(cards);

  return (
    // The queue is the work of the whole shift, so on a wide screen it gets the wide column and
    // the rest share the narrow one. Stacked, the queue still comes first.
    <div class="columns queue-first">
      <section class="panel">
        <div class="panel-head">
          <h2>Queue ({queue.length})</h2>
          <HelpPopout topic="serving" />
        </div>
        {queue.length === 0 && <p class="notice">No families are waiting.</p>}
        <ul class="cards">
          {queue.map((card) => (
            <QueueCard key={card.id} card={card} onUpdate={onUpdate} />
          ))}
        </ul>
      </section>

      <div class="side-panels">
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
                  <button onClick={() => onUpdate(card, { status: "confirmed" })}>
                    Undo<ScreenReaderText> distributed, card {card.number}</ScreenReaderText>
                  </button>
                </span>
              </li>
            ))}
            {left.map((card) => (
              <li class="card-row" key={card.id}>
                <Ticket number={card.number} />
                <Family card={card} />
                <StatusLabel status={card.status} />
                <span class="row-actions">
                  <button onClick={() => onUpdate(card, { status: "entered" })}>
                    Undo<ScreenReaderText> left without food, card {card.number}</ScreenReaderText>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <ReturnedBatches shift={shift} submit={submit} />
        <PartnerCards shift={shift} submit={submit} onSaved={onSaved} />

        <section class="panel">
          <div class="panel-head">
            <h2>Finish</h2>
            <HelpPopout topic="closing" />
          </div>
          {/* With cards still waiting the shift can't close, so the question becomes a stop that
            lists them (ADR 0040). Red stops; yellow asks. */}
          {confirmClose ? (
            <div class={unserved.length > 0 ? "confirm blocked" : "confirm"}>
              {unserved.length > 0 && (
                <>
                  <p class="stop">{waitingCardsRule(unserved.map((card) => card.number))}</p>
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
              {unserved.length === 0 && <p>Close this shift? Only an admin can reopen it.</p>}
              <div class="choices">
                {unserved.length === 0 && (
                  <button onClick={onCloseShift}>Yes, close the shift</button>
                )}
                <button ref={keepOpen} class="primary" onClick={() => askToClose(false)}>
                  Keep it open
                </button>
              </div>
            </div>
          ) : (
            <button ref={closeButton} onClick={() => askToClose(true)}>
              Close shift
            </button>
          )}
        </section>
      </div>
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
  // A cart without a weight stops the Family being distributed (ADR 0039). A warning, such as
  // extras not ticked, asks first and can be gone past.
  const [stop, setStop] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const carts = cartCount(card);

  function clearChecks() {
    setStop(null);
    setWarnings([]);
  }

  function distribute() {
    const parsed = loadsForCarts(loads, carts);
    void onUpdate(card, { loads: parsed, extrasAdded, extrasNote, status: "distributed" });
  }

  function markDistributed() {
    const check = checkBeforeDistribution(card, parseLoads(loads), extrasAdded);
    setStop(check.stop);
    setWarnings(check.stop ? [] : check.warnings);
    if (!check.stop && check.warnings.length === 0) distribute();
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
          <button aria-expanded={correcting} onClick={() => setCorrecting(!correcting)}>
            Correct details<ScreenReaderText>, card {card.number}</ScreenReaderText>
          </button>
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
          stop={stop}
          warnings={warnings}
          onLoads={(next) => {
            setLoads(next);
            clearChecks();
          }}
          onExtras={(added, note) => {
            setExtrasAdded(added);
            setExtrasNote(note);
            clearChecks();
          }}
          onMarkDistributed={markDistributed}
          onDistributeAnyway={distribute}
          onGoBack={clearChecks}
          onUndoConfirm={() => onUpdate(card, { status: "called" })}
          correcting={correcting}
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
  stop: string | null;
  warnings: string[];
  onLoads: (loads: string[]) => void;
  onExtras: (added: boolean, note: string) => void;
  onMarkDistributed: () => void;
  onDistributeAnyway: () => void;
  onGoBack: () => void;
  onUndoConfirm: () => void;
  correcting: boolean;
  onCorrect: () => void;
}

// What Distribution fills in once a card is confirmed: the weight of each cart and the extras.
function ConfirmedCard(props: ConfirmedCardProps) {
  const { card, stop, warnings } = props;
  // Asking about a warning moves focus to "Go back", and going back returns it.
  const markButton = useRef<HTMLButtonElement>(null);
  const goBack = useRef<HTMLButtonElement>(null);
  const cardNumber = <ScreenReaderText>, card {card.number}</ScreenReaderText>;
  return (
    <>
      <CartFields loads={props.loads} carts={props.carts} onChange={props.onLoads} />
      {needsExtrasCheck(card.familySize) && (
        <ExtrasFields added={props.extrasAdded} note={props.extrasNote} onChange={props.onExtras} />
      )}
      <div class="choices">
        <button
          ref={markButton}
          class="primary"
          onClick={() => {
            props.onMarkDistributed();
            afterRender(() => goBack.current?.focus());
          }}
        >
          Mark distributed{cardNumber}
        </button>
        <button onClick={props.onUndoConfirm}>Undo confirm{cardNumber}</button>
        <button aria-expanded={props.correcting} onClick={props.onCorrect}>
          Correct details{cardNumber}
        </button>
      </div>
      {/* Red stops, and says what to do; yellow asks. Read out as it appears. */}
      <div class="live" role="alert">
        {stop && <p class="stop">{stop}</p>}
      </div>
      {warnings.length > 0 && (
        <div class="confirm">
          {warnings.map((message) => (
            <p key={message}>{message}</p>
          ))}
          <div class="choices">
            <button onClick={props.onDistributeAnyway}>Mark distributed anyway{cardNumber}</button>
            <button
              ref={goBack}
              class="primary"
              onClick={() => {
                props.onGoBack();
                afterRender(() => markButton.current?.focus());
              }}
            >
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
