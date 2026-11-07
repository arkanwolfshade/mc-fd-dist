import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { ApiError, api, connectLive } from "./api.js";
import { Distribution } from "./Distribution.js";
import { FrontDesk } from "./FrontDesk.js";
import { mergeCard } from "./state.js";
import type { Card, Identity, Shift, ShiftWithCards, UpdateCard } from "./types.js";

function localDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

type View = "front_desk" | "distribution";

export function Station(props: { identity: Identity; onSignedOut: () => void }) {
  const { identity } = props;
  const [shift, setShift] = useState<ShiftWithCards | null | undefined>(undefined);
  const [connected, setConnected] = useState(true);
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>(
    identity.role === "distribution" ? "distribution" : "front_desk",
  );
  const date = useRef(localDate());

  const loadShift = useCallback(async () => {
    try {
      setShift(await api<ShiftWithCards>("GET", `/api/shifts?date=${date.current}`));
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 404) {
        setShift(null);
      } else if (failure instanceof ApiError && failure.status === 401) {
        props.onSignedOut();
      } else {
        setNotice("Could not load the shift. Check the connection.");
      }
    }
  }, []);

  const applyCard = useCallback((card: Card) => {
    setShift((current) =>
      current && current.id === card.shiftId
        ? { ...current, cards: mergeCard(current.cards, card) }
        : current,
    );
  }, []);

  useEffect(() => {
    return connectLive({
      onOpen: () => {
        setConnected(true);
        void loadShift();
      },
      onClose: () => setConnected(false),
      onMessage: (message) => {
        const { type, card } = message as { type: string; card: Card };
        if (type !== "card") return;
        // A first card can arrive before this station knows the shift was opened.
        setShift((current) => {
          if (!current) void loadShift();
          return current;
        });
        applyCard(card);
      },
    });
  }, []);

  async function openShift() {
    try {
      const created = await api<Shift>("POST", "/api/shifts", { date: date.current });
      setShift({ ...created, cards: [] });
    } catch (failure) {
      // Another station opened it first, which is fine.
      if (failure instanceof ApiError && failure.status === 409) {
        await loadShift();
      } else {
        setNotice(failure instanceof Error ? failure.message : "Could not open the shift");
      }
    }
  }

  const updateCard: UpdateCard = async (card, changes) => {
    setNotice("");
    try {
      applyCard(
        await api<Card>("PATCH", `/api/cards/${card.id}`, {
          revision: card.revision,
          ...changes,
        }),
      );
    } catch (failure) {
      if (failure instanceof ApiError && failure.body.card) {
        applyCard(failure.body.card as Card);
        setNotice(`Card ${card.number} was changed at another station. Please review it.`);
      } else {
        setNotice(failure instanceof Error ? failure.message : "Could not save that change");
      }
    }
  };

  async function signOut() {
    await api("POST", "/api/logout");
    props.onSignedOut();
  }

  return (
    <div class="station">
      <header class="bar">
        <strong>{date.current}</strong>
        {identity.role === "admin" ? (
          <span class="tabs">
            <button
              class={view === "front_desk" ? "selected" : ""}
              onClick={() => setView("front_desk")}
            >
              Front desk
            </button>
            <button
              class={view === "distribution" ? "selected" : ""}
              onClick={() => setView("distribution")}
            >
              Distribution
            </button>
          </span>
        ) : (
          <span>{identity.role === "front_desk" ? "Front desk" : "Distribution"}</span>
        )}
        <button onClick={signOut}>Sign out</button>
      </header>

      {!connected && (
        <p class="warning">
          Connection lost. Reconnecting… Use paper if this continues.
        </p>
      )}
      {notice && <p class="error">{notice}</p>}

      {shift === undefined && <p class="notice">Loading…</p>}
      {shift === null && (
        <div class="panel">
          <p>No shift has been opened for today.</p>
          <button class="primary" onClick={openShift}>
            Open today's shift
          </button>
        </div>
      )}
      {shift && view === "front_desk" && (
        <FrontDesk shift={shift} onSaved={applyCard} onUpdate={updateCard} />
      )}
      {shift && view === "distribution" && (
        <Distribution cards={shift.cards} onUpdate={updateCard} />
      )}
    </div>
  );
}
