// Calendar math for the Leave Planner.
//
// Everything here works in LOCAL time on purpose. `new Date("2026-08-07")` is
// parsed as UTC midnight, so in any timezone west of Greenwich `.getDate()`
// returns the 6th — which would shift every leave bar and holiday one cell to
// the left on the grid. `parseIsoDate` builds a local midnight instead, and
// `toIsoDate` reads the local components back, so a date string survives the
// round-trip unchanged regardless of where the browser is.

export type CalendarView = "month" | "week" | "day";

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** `YYYY-MM-DD` from a Date's local calendar components. */
export function toIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight for a `YYYY-MM-DD` string. Invalid input yields today. */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return startOfDay(new Date());
  return new Date(y, m - 1, d);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function addMonths(date: Date, months: number): Date {
  // Anchored on the 1st so stepping from e.g. Jan 31 lands on Feb 1 rather
  // than overflowing into March.
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/** Sunday-based, matching WEEKDAY_LABELS. */
export function startOfWeek(date: Date): Date {
  return addDays(startOfDay(date), -date.getDay());
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * The 42 cells (6 weeks × 7 days) of a month grid, padded with the trailing
 * days of the previous month and the leading days of the next.
 *
 * Always 6 rows, never 4 or 5 — a grid that changes height as you page through
 * months makes the whole page jump.
 */
export function buildMonthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function buildWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function dayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function weekLabel(date: Date): string {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  const sameMonth = isSameMonth(start, end);
  const startText = start.toLocaleDateString(undefined, {
    day: "numeric",
    ...(sameMonth ? {} : { month: "short" }),
  });
  const endText = end.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${startText} – ${endText}, ${end.getFullYear()}`;
}
