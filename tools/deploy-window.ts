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

// Names the shift running at the given moment, if any.
export function shiftAt(moment: Date): string | undefined {
  const phoenix = new Date(moment.getTime() + PHOENIX_OFFSET_HOURS * 3_600_000);
  const day = phoenix.getUTCDay();
  const hour = phoenix.getUTCHours() + phoenix.getUTCMinutes() / 60;
  const shift = SHIFTS.find((s) => s.days.includes(day) && hour >= s.start && hour < s.end);
  if (!shift) return undefined;
  return `${DAYS[day]} ${hourName(shift.start)} to ${hourName(shift.end)}`;
}
