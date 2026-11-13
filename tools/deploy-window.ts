// Shift times in Phoenix, when a release must not restart the app. Phoenix keeps UTC-7
// all year, with no daylight saving time.
const PHOENIX_OFFSET_HOURS = -7;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Shift {
  days: number[];
  start: number;
  end: number;
}

const SHIFTS: Shift[] = [
  { days: [1, 2, 4, 5], start: 7, end: 14 },
  { days: [3], start: 13, end: 20 },
];

function hourName(hour: number): string {
  if (hour === 12) return "noon";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

function runningShift(moment: Date): { shift: Shift; phoenix: Date } | undefined {
  const phoenix = new Date(moment.getTime() + PHOENIX_OFFSET_HOURS * 3_600_000);
  const day = phoenix.getUTCDay();
  const hour = phoenix.getUTCHours() + phoenix.getUTCMinutes() / 60;
  const shift = SHIFTS.find((s) => s.days.includes(day) && hour >= s.start && hour < s.end);
  return shift && { shift, phoenix };
}

// Names the shift running at the given moment, if any.
export function shiftAt(moment: Date): string | undefined {
  const running = runningShift(moment);
  if (!running) return undefined;
  const { shift, phoenix } = running;
  return `${DAYS[phoenix.getUTCDay()]} ${hourName(shift.start)} to ${hourName(shift.end)}`;
}

// When a release may go ahead: now outside a shift, otherwise when the running shift ends.
// Shifts never run back to back, so the end of one is always free.
export function windowOpensAt(moment: Date): Date {
  const running = runningShift(moment);
  if (!running) return moment;
  const { shift, phoenix } = running;
  const midnight = Date.UTC(phoenix.getUTCFullYear(), phoenix.getUTCMonth(), phoenix.getUTCDate());
  return new Date(midnight + (shift.end - PHOENIX_OFFSET_HOURS) * 3_600_000);
}

// A moment as Phoenix clock time, in the same style as the shift names ("2pm", "8:20am").
export function phoenixClock(moment: Date): string {
  const phoenix = new Date(moment.getTime() + PHOENIX_OFFSET_HOURS * 3_600_000);
  const hour = phoenix.getUTCHours() % 12 || 12;
  const minutes = phoenix.getUTCMinutes();
  const suffix = phoenix.getUTCHours() < 12 ? "am" : "pm";
  return `${hour}${minutes === 0 ? "" : `:${String(minutes).padStart(2, "0")}`}${suffix}`;
}

const HEARTBEAT_MS = 30 * 60_000;

export interface WaitOptions {
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
  // The longest a job can afford to wait; a window further away is refused at once.
  maxWaitMs: number;
}

export interface WaitResult {
  status: "open" | "waited" | "too-far";
  opensAt: Date;
}

// Waits for the window to open, so an approval given during a shift still releases once the
// shift is over. Sleeps in short steps and checks the clock after each, so an early wake-up
// never releases into a shift.
export async function waitForWindow(options: WaitOptions): Promise<WaitResult> {
  const { now, sleep, log, maxWaitMs } = options;
  const opensAt = windowOpensAt(now());
  const first = opensAt.getTime() - now().getTime();
  if (first <= 0) return { status: "open", opensAt };
  if (first > maxWaitMs) return { status: "too-far", opensAt };
  log(
    `A shift is running (${shiftAt(now())}, Phoenix time). Waiting until ${phoenixClock(opensAt)}.`,
  );
  while (shiftAt(now())) {
    const left = windowOpensAt(now()).getTime() - now().getTime();
    // Each sleep must finish before the clock is checked again, so the loop is sequential on purpose.
    // oxlint-disable-next-line no-await-in-loop
    await sleep(Math.min(left, HEARTBEAT_MS));
    if (shiftAt(now())) log(`Still waiting for the shift to end at ${phoenixClock(opensAt)}.`);
  }
  return { status: "waited", opensAt };
}
