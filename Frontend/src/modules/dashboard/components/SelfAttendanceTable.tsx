import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, CalendarX, UserCheck, Clock3, UserX, Timer } from "lucide-react";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import { ApiError } from "@/lib/apiClient";
import { dashboardApi, type WorkingDayAttendance } from "@/modules/dashboard/api/dashboardApi";

// The signed-in user's own attendance for the LAST 7 WORKING DAYS, from
// GET /dashboard/me — a token-scoped route that needs no permission, so it works
// for Team Lead and Employee alike (unlike the admin TodayAttendanceTable, which
// is gated on `attendance.view`).
//
// "Working days" is the point: the backend walks backwards day by day through the
// employee's own working-week schedule (designation -> department -> global) and
// the holiday calendar, so a weekend or an Eid holiday never occupies one of the
// seven rows. That resolution can't happen in the browser — reading the schedule
// and holiday endpoints requires `working-days.view`, which an Employee does not
// hold. It also replaces the old month/year pickers: a fixed seven-working-day
// window is a straight answer to "how have I been doing lately", where an empty
// month view was just a dead end.
//
// A row with a null status is a working day with no attendance record at all —
// shown as "No record" rather than silently omitted, because the gap is the
// information.

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function SelfAttendanceTable() {
  const [days, setDays] = useState<WorkingDayAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    dashboardApi
      .getMine()
      .then((data) => {
        if (!cancelled) setDays(data.last_working_days);
      })
      .catch((err) => {
        if (cancelled) return;
        setDays([]);
        setError(
          err instanceof ApiError ? `Couldn't load attendance (${err.status})` : "Couldn't load attendance",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Summarises exactly the rows on screen, so the tiles and the table can never
  // describe different windows.
  const summary = useMemo(() => {
    const present = days.filter((d) => d.status === "Present").length;
    const late = days.filter((d) => d.status === "Late").length;
    const absent = days.filter((d) => d.status === "Absent").length;
    const totalHours = days.reduce((sum, d) => sum + (d.working_hours ?? 0), 0);
    return { present, late, absent, totalHours: Math.round(totalHours * 10) / 10 };
  }, [days]);

  // The API returns them newest first; keep that order.
  const range =
    days.length > 0 ? `${formatDate(days[days.length - 1].date)} — ${formatDate(days[0].date)}` : null;

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900 sm:text-lg">My Attendance</h3>
          <p className="mt-0.5 text-xs text-gray-400">
            Last {days.length || 7} working days{range ? ` · ${range}` : ""} · weekends &amp; holidays
            skipped
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={UserCheck} label="Present" value={summary.present} tone="emerald" />
        <StatCard icon={Timer} label="Late" value={summary.late} tone="amber" />
        <StatCard icon={UserX} label="Absent" value={summary.absent} tone="rose" />
        <StatCard icon={Clock3} label="Total Hours" value={summary.totalHours} tone="sky" />
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-3 text-xs font-medium text-rose-600">{error}</p>
        ) : days.length === 0 ? (
          <EmptyState
            icon={CalendarX}
            title="No working days yet"
            description="There are no working days on your calendar in the recent past to report on."
          />
        ) : (
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-3 font-medium">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays size={13} /> Date
                  </span>
                </th>
                <th className="pb-3 font-medium">Check-in</th>
                <th className="pb-3 font-medium">Check-out</th>
                <th className="pb-3 font-medium">Hours</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 font-medium text-gray-900">{formatDate(d.date)}</td>
                  <td className="py-3 text-gray-600">{d.check_in ?? "—"}</td>
                  <td className="py-3 text-gray-600">{d.check_out ?? "—"}</td>
                  <td className="py-3 text-gray-600">
                    {d.working_hours != null ? `${d.working_hours}h` : "—"}
                  </td>
                  <td className="py-3">
                    {d.status ? (
                      <StatusBadge status={d.status} />
                    ) : (
                      <span className="text-xs font-medium text-gray-400">No record</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: string }) {
  const toneClasses = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    sky: "bg-sky-50 text-sky-700 border-sky-100",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClasses}`}>
      <div className="flex items-center gap-2">
        <Icon size={18} className="shrink-0" />
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="mt-1 text-xs font-medium opacity-80">{label}</p>
        </div>
      </div>
    </div>
  );
}
