// Small colored pill used across Attendance / Leave / Payroll / Appraisal /
// Notifications for status text (Present, Pending, Approved, Rejected, etc.).
// Centralized here so every module gets consistent colors instead of each
// page inventing its own tone mapping.

const TONE_BY_STATUS: Record<string, string> = {
  present: "bg-emerald-50 text-emerald-600",
  approved: "bg-emerald-50 text-emerald-600",
  completed: "bg-emerald-50 text-emerald-600",
  generated: "bg-emerald-50 text-emerald-600",
  paid: "bg-emerald-50 text-emerald-600",

  late: "bg-amber-50 text-amber-600",
  pending: "bg-amber-50 text-amber-600",

  absent: "bg-rose-50 text-rose-600",
  rejected: "bg-rose-50 text-rose-600",
  unpaid: "bg-rose-50 text-rose-600",

  leave: "bg-sky-50 text-sky-600",
  holiday: "bg-violet-50 text-violet-600",
};

export default function StatusBadge({ status }: { status: string }) {
  const tone = TONE_BY_STATUS[status.toLowerCase()] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {status}
    </span>
  );
}
