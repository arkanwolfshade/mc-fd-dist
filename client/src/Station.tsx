// A station sets up its outbox, live connection and timers once per sign-in. The callbacks
// they use read only state setters, refs and values fixed for that sign-in, so listing
// them as dependencies would only reconnect and resubscribe for no reason.
/* oxlint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Role } from "../../server/accounts.js";
import type { LiveMessage } from "../../server/card-routes.js";
import { Admin } from "./Admin.js";
import { ApiError, NetworkError, api, connectLive } from "./api.js";
import { Distribution } from "./Distribution.js";
import { FrontDesk } from "./FrontDesk.js";
import { Help } from "./Help.js";
import { Outbox } from "./outbox.js";
import type { QueuedWrite } from "./outbox.js";
import { withPending } from "./pending.js";
import { isoDate, mergeCard } from "./state.js";
import { Summary } from "./Summary.js";
import type { Card, Identity, Shift, ShiftWithCards, UpdateCard } from "./types.js";

type View = "front_desk" | "distribution" | "summary" | "admin" | "help";

const VIEW_LABELS: Record<View, string> = {
  front_desk: "Front desk",
  distribution: "Distribution",
  summary: "Totals",
  admin: "Admin",
  help: "Help",
};

const VIEWS_BY_ROLE: Record<Role, View[]> = {
  front_desk: ["front_desk", "summary", "help"],
  distribution: ["distribution", "summary", "help"],
  admin: ["front_desk", "distribution", "summary", "admin", "help"],
};

const STATION_NAMES: Record<Role, string> = {
  front_desk: "Front desk",
  distribution: "Distribution",
  admin: "Admin",
};

// "2026-11-07" becomes "Saturday, November 7".
function dayInWords(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// The admin and help screens don't depend on today's shift.
const SHIFT_VIEWS: ReadonlySet<View> = new Set(["front_desk", "distribution", "summary"]);

const DATE_CHECK_INTERVAL_MS = 60 * 1000;

// A socket can stop delivering without closing, so stations also catch up on a timer.
const SYNC_INTERVAL_MS = 30 * 1000;

interface Rejection {
  id: string;
  label: string;
  message: string;
}

export function Station(props: { identity: Identity; onSignedOut: () => void }) {
  const { identity } = props;
  const [shift, setShift] = useState<ShiftWithCards | null | undefined>(undefined);
  const [connected, setConnected] = useState(true);
  const [notice, setNotice] = useState("");
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [view, setView] = useState<View>(
    identity.role === "distribution" ? "distribution" : "front_desk",
  );
  // Dedicated devices stay signed in for weeks, so "today" must keep moving.
  const [today, setToday] = useState(() => isoDate(new Date()));
  const date = useRef(today);
  const snapshotKey = `shift:${identity.username}`;

  const applyCard = useCallback((card: Card) => {
    setShift((current) =>
      current && current.id === card.shiftId
        ? { ...current, cards: mergeCard(current.cards, card) }
        : current,
    );
  }, []);

  const removeCard = useCallback((shiftId: number, cardId: number) => {
    setShift((current) =>
      current && current.id === shiftId
        ? { ...current, cards: current.cards.filter((card) => card.id !== cardId) }
        : current,
    );
  }, []);

  // Admins only, and it needs a connection: a deletion is never queued. See ADR 0019.
  const deleteCard =
    identity.role === "admin"
      ? async (card: Card) => {
          setNotice("");
          try {
            await api("DELETE", `/api/cards/${card.id}`);
            removeCard(card.shiftId, card.id);
          } catch (failure) {
            setNotice(failure instanceof Error ? failure.message : "Could not delete that card");
          }
        }
      : undefined;

  const outbox = useMemo(
    () =>
      new Outbox({
        storage: localStorage,
        key: `outbox:${identity.username}`,
        send: (write) => api(write.method, write.url, write.body),
        onSent: (write, data) => {
          if (write.kind === "card-create" || write.kind === "card-update") {
            applyCard(data as Card);
          }
        },
        onRejected: (write: QueuedWrite, error: ApiError) => {
          if (error.body.card) {
            applyCard(error.body.card as Card);
          }
          setRejections((current) => [
            ...current,
            { id: write.id, label: write.label, message: error.message },
          ]);
        },
        onSessionEnded: props.onSignedOut,
      }),
    [],
  );
  const [waiting, setWaiting] = useState<QueuedWrite[]>(outbox.items);
  useEffect(() => outbox.subscribe(setWaiting), []);

  const loadShift = useCallback(async () => {
    const requested = date.current;
    try {
      const loaded = await api<ShiftWithCards>("GET", `/api/shifts?date=${requested}`);
      // An answer for a day that has since ended must not replace the new day's shift.
      if (requested !== date.current) return;
      setShift(loaded);
      setConnected(true);
    } catch (failure) {
      if (requested !== date.current) return;
      if (failure instanceof ApiError && failure.status === 404) {
        setShift(null);
        setConnected(true);
      } else if (failure instanceof ApiError && failure.status === 401) {
        props.onSignedOut();
      } else if (failure instanceof NetworkError) {
        setConnected(false);
        setShift((current) => current ?? savedShift(snapshotKey, date.current));
      } else {
        setNotice("Could not load the shift. Check the connection.");
      }
    }
  }, []);

  // Sends what is waiting first, so that reloading shows the result.
  const sync = useCallback(async () => {
    await outbox.flush();
    await loadShift();
  }, []);

  useEffect(() => {
    if (shift) {
      localStorage.setItem(snapshotKey, JSON.stringify(shift));
    }
  }, [shift]);

  useEffect(() => {
    void sync();
    const timer = setInterval(() => void sync(), SYNC_INTERVAL_MS);
    const goneOffline = () => setConnected(false);
    const backOnline = () => void sync();
    window.addEventListener("offline", goneOffline);
    window.addEventListener("online", backOnline);
    return () => {
      clearInterval(timer);
      window.removeEventListener("offline", goneOffline);
      window.removeEventListener("online", backOnline);
    };
  }, []);

  useEffect(() => {
    return connectLive({
      onOpen: () => void sync(),
      onClose: () => {
        setConnected(false);
        // The socket also closes when the session ends, such as a changed password.
        api("GET", "/api/me").catch((failure) => {
          if (failure instanceof ApiError && failure.status === 401) {
            props.onSignedOut();
          }
        });
      },
      onMessage: (message) => {
        const live = message as LiveMessage;
        // An update can arrive before this station knows the shift was opened.
        setShift((current) => {
          if (!current) void loadShift();
          return current;
        });
        if (live.type === "card") {
          applyCard(live.card);
        } else if (live.type === "card-deleted") {
          removeCard(live.shiftId, live.cardId);
        } else if (live.type === "shift") {
          setShift((current) =>
            current && current.id === live.shift.id
              ? { ...current, status: live.shift.status }
              : current,
          );
        } else {
          setShift((current) =>
            current && current.id === live.shiftId
              ? { ...current, returnedBatches: live.returnedBatches }
              : current,
          );
        }
      },
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = isoDate(new Date());
      if (current !== date.current) {
        date.current = current;
        setToday(current);
        void loadShift();
      }
    }, DATE_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  async function closeShift(shiftId: number) {
    setNotice("");
    try {
      const closed = await api<Shift>("POST", `/api/shifts/${shiftId}/close`);
      setShift((current) =>
        current && current.id === closed.id ? { ...current, status: closed.status } : current,
      );
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : "Could not close the shift");
    }
  }

  async function openShift() {
    setNotice("");
    try {
      const created = await api<Shift>("POST", "/api/shifts", { date: date.current });
      setShift({ ...created, cards: [], returnedBatches: [] });
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
      const result = await outbox.submit({
        kind: "card-update",
        method: "PATCH",
        url: `/api/cards/${card.id}`,
        cardId: card.id,
        body: { revision: card.revision, ...changes },
        label: `Card ${card.number}`,
      });
      if (result.status === "sent") {
        applyCard(result.data as Card);
      }
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
    setNotice("");
    try {
      await api("POST", "/api/logout");
      localStorage.removeItem(snapshotKey);
      props.onSignedOut();
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : "Could not sign out");
    }
  }

  const shiftView = useMemo(() => (shift ? withPending(shift, waiting) : shift), [shift, waiting]);

  return (
    <div class="station">
      <header class="bar">
        <div class="station-id">
          <strong class="station-name">{STATION_NAMES[identity.role]}</strong>
          <span class="station-date">{dayInWords(today)}</span>
        </div>
        <span class={connected ? "connection online" : "connection offline"}>
          {connected ? "Connected" : "Offline"}
        </span>
        <nav class="tabs" aria-label="Screens">
          {VIEWS_BY_ROLE[identity.role].map((option) => (
            <button
              key={option}
              class={view === option ? "selected" : ""}
              aria-current={view === option ? "page" : undefined}
              onClick={() => setView(option)}
            >
              {VIEW_LABELS[option]}
            </button>
          ))}
        </nav>
        {/* Station devices stay signed in, so this is kept small and out of the way. */}
        <button class="signout" onClick={signOut}>
          Sign out
        </button>
      </header>

      {!connected && (
        <p class="warning">
          Connection lost. Entries are being kept on this device. This station can't see new entries
          from others until it returns.
        </p>
      )}
      {waiting.length > 0 && (
        <p class="warning">
          {waiting.length} {waiting.length === 1 ? "entry" : "entries"} waiting to send. Totals will
          update once they arrive.
        </p>
      )}
      {notice && <p class="error">{notice}</p>}
      {rejections.map((rejection) => (
        <div class="rejected" key={rejection.id}>
          <span>
            <strong>{rejection.label}</strong> could not be saved: {rejection.message}
          </span>
          <button
            onClick={() =>
              setRejections((current) => current.filter((other) => other.id !== rejection.id))
            }
          >
            Dismiss
          </button>
        </div>
      ))}

      {view === "admin" && <Admin identity={identity} />}
      {view === "help" && <Help role={identity.role} />}

      {SHIFT_VIEWS.has(view) && shiftView === undefined && (
        <p class="notice">
          {connected ? "Loading…" : "Today's shift can't be loaded until the connection returns."}
        </p>
      )}
      {SHIFT_VIEWS.has(view) && shiftView === null && (
        <div class="panel">
          <p>No shift has been opened for today.</p>
          <button class="primary" onClick={openShift}>
            Open today's shift
          </button>
        </div>
      )}
      {SHIFT_VIEWS.has(view) && shiftView?.status === "closed" && (
        <>
          <p class="warning">
            This shift is closed. An admin can reopen it if something needs correcting.
          </p>
          <Summary shift={shiftView} />
        </>
      )}
      {shiftView?.status === "open" && view === "front_desk" && (
        <FrontDesk
          shift={shiftView}
          submit={(write) => outbox.submit(write)}
          onSaved={applyCard}
          onUpdate={updateCard}
          onDelete={deleteCard}
        />
      )}
      {shiftView?.status === "open" && view === "distribution" && (
        <Distribution
          shift={shiftView}
          submit={(write) => outbox.submit(write)}
          onSaved={applyCard}
          onUpdate={updateCard}
          onDelete={deleteCard}
          onCloseShift={() => closeShift(shiftView.id)}
        />
      )}
      {shiftView?.status === "open" && view === "summary" && <Summary shift={shiftView} />}
    </div>
  );
}

// The last shift seen, for a reload during an outage. Only used for the same date.
function savedShift(key: string, date: string): ShiftWithCards | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null") as ShiftWithCards | null;
    return saved?.date === date ? saved : undefined;
  } catch {
    return undefined;
  }
}
