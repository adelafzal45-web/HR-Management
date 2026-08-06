// Shared "Daily / Weekly / Monthly" period helper for the dashboard's live
// card summaries. Pure date math only — every card still gets its numbers
// from a real endpoint (adminAttendanceApi / adminLeaveApi); this just works
// out which rows fall inside the selected window.

export type SummaryPeriod = "daily" | "weekly" | "monthly";

export const PERIOD_OPTIONS: { key: SummaryPeriod; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

const toIso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Inclusive [from, to] ISO date range for the given period, anchored on today. */
export function getPeriodRange(period: SummaryPeriod, anchor: Date = new Date()): { from: string; to: string } {
  const today = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());

  if (period === "daily") {
    const iso = toIso(today);
    return { from: iso, to: iso };
  }

  if (period === "weekly") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6); // last 7 days, inclusive of today
    return { from: toIso(from), to: toIso(today) };
  }

  // monthly — the whole calendar month containing today
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: toIso(from), to: toIso(to) };
}

/** Every distinct {month, year} pair a [from, to] ISO range touches. */
export function monthsInRange(from: string, to: string): { month: number; year: number }[] {
  const start = new Date(from);
  const end = new Date(to);
  const out: { month: number; year: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    out.push({ month: cursor.getMonth() + 1, year: cursor.getFullYear() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

export function isWithinRange(dateIso: string, from: string, to: string): boolean {
  return dateIso >= from && dateIso <= to;
}
