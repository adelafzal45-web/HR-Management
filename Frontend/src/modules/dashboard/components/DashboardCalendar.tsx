import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/app/providers/AuthContext";
import robot from "@/assets/robot-trimmed.png";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function buildMonthGrid(viewDate: Date): (Date | null)[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  // JS getDay(): 0=Sun..6=Sat. We render Mon-first, so shift.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = Array.from({ length: leadingBlanks }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function greetingFor(hour: number) {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export default function DashboardCalendar() {
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const cells = useMemo(() => buildMonthGrid(viewDate), [viewDate]);
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">Calendar</h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[7.5rem] text-center text-sm font-semibold text-gray-800">{monthLabel}</span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAYS.map((w) => (
            <span key={w} className="py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {w}
            </span>
          ))}
          {cells.map((date, i) => {
            if (!date) return <span key={i} />;
            const isToday = isSameDay(date, today);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            return (
              <span key={i} className="flex items-center justify-center py-1">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                    isToday
                      ? "bg-brand font-bold text-white"
                      : isWeekend
                        ? "font-medium text-amber-500"
                        : "font-medium text-gray-700"
                  }`}
                >
                  {date.getDate()}
                </span>
              </span>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" /> Today
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-200" /> Weekend
          </span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-amber-500 p-5 text-white shadow-sm">
        <p className="text-sm font-medium text-white/90">{greetingFor(today.getHours())}</p>
        <p className="text-2xl font-extrabold">{user?.firstName ?? "there"}!</p>
        <p className="mt-1 text-xs text-white/80">
          {today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <img src={robot} alt="" aria-hidden className="pointer-events-none absolute -bottom-4 -right-2 h-28 w-28 object-contain opacity-90" />
      </div>
    </div>
  );
}
