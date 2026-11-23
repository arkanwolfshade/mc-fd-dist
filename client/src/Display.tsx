/* oxlint-disable react-hooks/exhaustive-deps -- the connection and timers are set up once, and read what changes through refs, as in Station.tsx */
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { DisplayCard, DisplayMessage } from "../../server/display.js";
import { cartCount } from "../../server/rules.js";
import { api, ApiError, connectLive } from "./api.js";
import {
  applyDisplayMessage,
  isStale,
  queueView,
  rowsThatFit,
  screenFor,
  settleLoad,
} from "./display-state.js";
import type { DisplayShift, KnownDisplayShift, QueueGroup } from "./display-state.js";
import { classifyLoadFailure, dayInWords, isoDate } from "./state.js";

const SYNC_INTERVAL_MS = 30 * 1000;
// Each row is this share of the screen's height, which styles.css also uses (.wall-row), so a row
// is the same size on any display and the room for rows is the same number of them.
const ROW_VH = 11;

function peopleAndCarts(card: DisplayCard): string {
  const people = card.familySize === 1 ? "1 person" : `${card.familySize} people`;
  const carts = cartCount(card);
  return `${people} · ${carts} ${carts === 1 ? "cart" : "carts"}`;
}

function clockTime(time: number): string {
  return new Date(time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function Group(props: { title: string; hint: string; group: QueueGroup }) {
  const { title, hint, group } = props;
  return (
    <section class="wall-group">
      <h2>
        <span>
          {title} ({group.total})
        </span>
        <span class="wall-hint">{hint}</span>
      </h2>
      <ul class="wall-list">
        {group.total === 0 && <li class="wall-none">None</li>}
        {group.shown.map((card) => (
          <li class="wall-row" key={card.id}>
            <span class="ticket wall-number">{card.number}</span>
            <span class="wall-details">
              <span class="wall-facts">{peopleAndCarts(card)}</span>
              {(card.seniorBox || card.cheese) && (
                <span class="wall-badges">
                  {card.seniorBox && <span class="wall-badge">Senior Box</span>}
                  {card.cheese && <span class="wall-badge">Cheese</span>}
                </span>
              )}
            </span>
          </li>
        ))}
        {group.hidden > 0 && <li class="wall-more">+{group.hidden} more waiting</li>}
      </ul>
    </section>
  );
}

// The queue on the wall of the distribution room. It only reads, so there is nothing to sign out
// of or to tap; it is signed in once and left. See ADR 0033.
export function Display(props: { onSignedOut: () => void }) {
  const [shift, setShift] = useState<KnownDisplayShift>(undefined);
  const [today, setToday] = useState(() => isoDate(new Date()));
  // Since when the connection has been down, and when the queue last came from the server.
  const [lostSince, setLostSince] = useState<number | null>(null);
  const [lastHeard, setLastHeard] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [capacity, setCapacity] = useState(1);

  const date = useRef(today);
  const latestShift = useRef(shift);
  latestShift.current = shift;
  const groups = useRef<HTMLDivElement>(null);
  // What the wall hears while a reload is waiting for its answer, so that the answer cannot
  // erase it. Each message is numbered, and a reload replays those from after it began.
  const heard = useRef<{ order: number; message: DisplayMessage }[]>([]);
  const heardCount = useRef(0);
  const reloading = useRef(0);

  const markConnected = useCallback((connected: boolean) => {
    if (connected) {
      setLostSince(null);
      setLastHeard(Date.now());
    } else {
      setLostSince((since) => since ?? Date.now());
    }
  }, []);

  const loadShift = useCallback(async () => {
    const requested = date.current;
    const began = heardCount.current;
    reloading.current += 1;
    try {
      const loaded = await api<DisplayShift>("GET", `/api/display?date=${requested}`);
      // An answer for a day that has since ended must not replace the new day's shift.
      if (requested !== date.current) return;
      const since = heard.current.filter((entry) => entry.order >= began);
      setShift(
        settleLoad(
          loaded,
          since.map((entry) => entry.message),
          requested,
        ),
      );
      markConnected(true);
    } catch (failure) {
      if (requested !== date.current) return;
      const outcome = classifyLoadFailure(failure);
      if (outcome === "no-shift") {
        setShift(null);
        markConnected(true);
      } else if (outcome === "sign-out") {
        props.onSignedOut();
      } else {
        markConnected(false);
      }
    } finally {
      reloading.current -= 1;
      if (reloading.current === 0) heard.current = [];
    }
  }, []);

  useEffect(() => {
    void loadShift();
    const timer = setInterval(() => void loadShift(), SYNC_INTERVAL_MS);
    const goneOffline = () => markConnected(false);
    const backOnline = () => void loadShift();
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
      onOpen: () => void loadShift(),
      onClose: () => {
        markConnected(false);
        // The socket also closes when the session ends, such as a changed password.
        api("GET", "/api/me").catch((failure) => {
          if (failure instanceof ApiError && failure.status === 401) {
            props.onSignedOut();
          }
        });
      },
      onMessage: (message) => {
        // An update can arrive before the wall knows the shift was opened.
        if (!latestShift.current) void loadShift();
        const update = message as DisplayMessage;
        if (reloading.current > 0) {
          heard.current.push({ order: heardCount.current, message: update });
        }
        heardCount.current += 1;
        setShift((current) => applyDisplayMessage(current, update, date.current));
      },
    });
  }, []);

  // Each second, so that a connection that stays down is noticed, and so that "today" keeps
  // moving on a screen that stays signed in for weeks.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      const current = isoDate(new Date());
      if (current !== date.current) {
        date.current = current;
        setToday(current);
        void loadShift();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const stale = isStale({ lostSince, lastHeard, now });
  const screen = screenFor(shift, stale);
  const showingQueue = screen === "queue";

  // How many rows fit in a list, from the room it has, so a long queue ends in a count.
  useEffect(() => {
    const container = groups.current;
    if (!container) return undefined;
    const measure = () => {
      const space = container.querySelector(".wall-list")?.clientHeight ?? 0;
      setCapacity(rowsThatFit(space, (window.innerHeight * ROW_VH) / 100));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [showingQueue]);

  const view = queueView(shift ? shift.cards : [], capacity);

  return (
    <main class="wall">
      <header class="wall-bar">
        <h1>Distribution queue</h1>
        <span class="wall-date">{dayInWords(today)}</span>
      </header>
      {screen === "queue" && (
        <div class="wall-groups" ref={groups}>
          <Group title="Confirmed" hint="Being packed" group={view.confirmed} />
          <Group title="Called" hint="On their way" group={view.called} />
        </div>
      )}
      {screen === "offline" && (
        <div class="wall-notice offline" role="alert">
          <p class="wall-notice-title">Not connected</p>
          <p>The queue is hidden until the connection returns. Check the tablets.</p>
          <p>Last updated {clockTime(lastHeard)}</p>
        </div>
      )}
      {screen === "loading" && <p class="wall-notice">Loading…</p>}
      {screen === "no-shift" && <p class="wall-notice">No shift is open today</p>}
      {screen === "closed" && <p class="wall-notice">Today's shift is closed</p>}
      {screen === "empty" && <p class="wall-notice">No families are waiting</p>}
    </main>
  );
}
