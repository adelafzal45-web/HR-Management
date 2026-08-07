import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, CalendarX, UserCheck, Clock3, UserX, Timer } from "lucide-react";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import { attendanceApi, type AttendanceRecord } from "@/api/hrApi";

// The signed-in user's OWN attendance summary, for roles that can see their own
// data but not the org-wide table (Team Lead, Employee). It reads the permission
// -free self-service route `GET /attendance/me` via hrApi.attendanceApi.getHistory,
// so it works without `attendance.view` — unlike the admin TodayAttendanceTable,
// which fetches the whole org and is gated on that permission.

const now = new Date();

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function SelfAttendanceTable() {
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    attendanceApi
      .getHistory({ month, year })
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, year]);

  const summary = useMemo(() => {
    const present = history.filter((r) => r.status === "Present").length;
    const late = history.filter((r) => r.status === "Late").length;
    const absent = history.filter((r) => r.status === "Absent").length;
    const totalHours = history.reduce((sum, r) => sum + (r.workingHours ?? 0), 0);
    return { present, late, absent, totalHours: Math.round(totalHours * 10) / 10 };
  }, [history]);

  const sorted = useMemo(
    () => [...history].sort((a, b) => (a.attendanceDate < b.attendanceDate ? 1 : -1)),
    [history],
  );

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = [now.getFullYear(), now.getFullYear() - 1];

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold text-gray-900 sm:text-lg">My Attendance</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="min-h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
            aria-label="Filter by month"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleDateString(undefined, { month: "long" })}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="min-h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
            aria-label="Filter by year"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
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
        ) : sorted.length === 0 ? (
          <EmptyState icon={CalendarX} title="No records found" description="There's no attendance data for the selected month." />
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
              {sorted.map((r) => (
                <tr key={r.attendanceId} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 font-medium text-gray-900">{formatDate(r.attendanceDate)}</td>
                  <td className="py-3 text-gray-600">{r.checkIn ?? "—"}</td>
                  <td className="py-3 text-gray-600">{r.checkOut ?? "—"}</td>
                  <td className="py-3 text-gray-600">{r.workingHours != null ? `${r.workingHours}h` : "—"}</td>
                  <td className="py-3">
                    <StatusBadge status={r.status} />
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
