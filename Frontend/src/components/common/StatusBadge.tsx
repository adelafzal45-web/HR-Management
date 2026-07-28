// Small colored pill used across Attendance / Leave / Payroll / Appraisal /
// Notifications for status text (Present, Pending, Approved, Rejected, etc.).
// Centralized here so every module gets consistent colors instead of each
// page inventing its own tone mapping.

// Single accent color (brand) for "good"/active states, a solid brand chip
// for anything that needs attention, and neutral gray for everything else —
// rather than a different hue per status. Meaning still comes through via
// the label text and the solid-vs-tint weight, not through hue variety.
const TONE_BY_STATUS: Record<string, string> = {
  present: "bg-brand-light text-brand-dark",
  approved: "bg-brand-light text-brand-dark",
  completed: "bg-brand-light text-brand-dark",
  generated: "bg-brand-light text-brand-dark",
  paid: "bg-brand-light text-brand-dark",
  active: "bg-brand-light text-brand-dark",

  late: "bg-brand text-white",
  pending: "bg-brand text-white",

  absent: "bg-gray-800 text-white",
  rejected: "bg-gray-800 text-white",
  unpaid: "bg-gray-800 text-white",
  inactive: "bg-gray-800 text-white",

  leave: "bg-gray-100 text-gray-600",
  "on leave": "bg-gray-100 text-gray-600",
  holiday: "bg-gray-100 text-gray-600",
  "half-day": "bg-gray-100 text-gray-600",
};

// "on leave" / "in progress"-style statuses arrive with spaces or mixed
// case; normalize to Title Case so the label always looks intentional
// regardless of how the source data is cased.
function toTitleCase(value: string) {
  return value
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");
}

export default function StatusBadge({ status }: { status: string }) {
  const tone = TONE_BY_STATUS[status.toLowerCase()] ?? "bg-gray-100 text-gray-600";
  return (
    <span
      className={`inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1 text-center text-xs font-semibold leading-none ${tone}`}
    >
      {toTitleCase(status)}
    </span>
  );
}
