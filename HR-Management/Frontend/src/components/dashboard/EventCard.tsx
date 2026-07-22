import type { CalendarEvent } from "../../lib/dashboardMockData";

const TONES: Record<CalendarEvent["type"], string> = {
  holiday: "bg-gradient-to-r from-brand to-brand-dark",
  event: "bg-gradient-to-r from-indigo-400 to-indigo-500",
};

export default function EventCard({ title, displayDate, type }: CalendarEvent) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-white shadow-sm ${TONES[type]}`}
    >
      <span className="min-w-0 truncate text-sm font-medium">{title}</span>
      <span className="shrink-0 text-xs font-normal opacity-90">{displayDate}</span>
    </div>
  );
}
