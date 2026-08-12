import { useEffect, useState } from "react";
import { CalendarHeart } from "lucide-react";
import { holidaysApi, type Holiday } from "@/modules/leave/api/holidaysApi";

const MAX_SHOWN = 4;

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

/**
 * Every active employee, HR, and Admin can create Holidays and Events on the
 * Leave → Holidays & Events tab (`holiday.view` is granted to every role), so
 * this reads the same `/holidays` list rather than a role-gated aggregate —
 * it renders identically no matter who is signed in.
 */
export default function UpcomingEvents() {
  const [items, setItems] = useState<Holiday[] | null>(null);

  useEffect(() => {
    let active = true;
    const today = new Date();
    const todayIso = toIso(today);

    // Two calls, not one: a recurring holiday from a prior year is returned
    // by the backend for "this year" already, but a fixed entry near a
    // December→January boundary needs next year's list pulled in too, or it
    // would vanish from "upcoming" for the last few weeks of December.
    Promise.all([
      holidaysApi.list({ year: today.getFullYear(), pageSize: 0 }),
      holidaysApi.list({ year: today.getFullYear() + 1, pageSize: 0 }),
    ])
      .then(([current, next]) => {
        if (!active) return;
        const seen = new Set<string>();
        const merged = [...current.data, ...next.data].filter((h) => {
          if (seen.has(h.holidayId)) return false;
          seen.add(h.holidayId);
          return h.holidayDate >= todayIso;
        });
        merged.sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
        setItems(merged.slice(0, MAX_SHOWN));
      })
      .catch(() => {
        if (active) setItems([]);
      });

    return () => {
      active = false;
    };
  }, []);

  if (items === null) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 text-base font-bold text-gray-900">Upcoming Events</h3>
        <div className="space-y-2.5">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="mb-3 text-base font-bold text-gray-900">Upcoming Events</h3>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CalendarHeart size={22} className="text-gray-300" />
          <p className="text-xs text-gray-400">No holidays or events coming up.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => {
            const isEvent = item.eventType === "Event";
            return (
              <div
                key={item.holidayId}
                className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 ${
                  isEvent ? "bg-violet-200/70" : "bg-amber-200/70"
                }`}
              >
                <span className="truncate text-sm font-bold text-gray-900" title={item.name}>
                  {item.name}
                </span>
                <span className="shrink-0 text-sm text-gray-600">{formatEventDate(item.holidayDate)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
