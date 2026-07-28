// Small colored pill used across Attendance / Leave / Payroll / Appraisal /
// Notifications for status text (Present, Pending, Approved, Rejected, etc.).
// Centralized here so every module gets consistent colors instead of each
// page inventing its own tone mapping.

const TONE_BY_STATUS: Record<string, { pill: string; dot: string }> = {
  present: { pill: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400", dot: "bg-emerald-500" },
  approved: { pill: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400", dot: "bg-emerald-500" },
  completed: { pill: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400", dot: "bg-emerald-500" },
  generated: { pill: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400", dot: "bg-emerald-500" },
  paid: { pill: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400", dot: "bg-emerald-500" },
  active: { pill: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400", dot: "bg-emerald-500" },

  late: { pill: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400", dot: "bg-amber-500" },
  pending: { pill: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400", dot: "bg-amber-500" },

  absent: { pill: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400", dot: "bg-rose-500" },
  rejected: { pill: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400", dot: "bg-rose-500" },
  unpaid: { pill: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400", dot: "bg-rose-500" },
  inactive: { pill: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400", dot: "bg-rose-500" },

  leave: { pill: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400", dot: "bg-sky-500" },
  "on leave": { pill: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400", dot: "bg-sky-500" },
  holiday: { pill: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400", dot: "bg-violet-500" },
};

const DEFAULT_TONE = { pill: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300", dot: "bg-gray-400" };

// "on leave" / "in progress"-style statuses arrive with spaces or mixed
// case; normalize to Title Case so the label always looks intentional
// regardless of how the source data is cased.
function toTitleCase(value: string) {
  return value
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");
}

export default function StatusBadge({ status, dot = true }: { status: string; dot?: boolean }) {
  const tone = TONE_BY_STATUS[status.toLowerCase()] ?? DEFAULT_TONE;
  return (
    <span
      className={`inline-flex max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-center text-xs font-semibold leading-none ${tone.pill}`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />}
      {toTitleCase(status)}
    </span>
  );
}
