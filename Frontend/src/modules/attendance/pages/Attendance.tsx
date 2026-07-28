import { useEffect, useMemo, useState } from "react";
import { LogIn, LogOut, Clock, CalendarDays, CalendarX } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { attendanceApi, type AttendanceRecord } from "@/api/hrApi";

const now = new Date();

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function Attendance() {
  const status = useBackendStatus();

  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [loadingToday, setLoadingToday] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [actionLoading, setActionLoading] = useState<"in" | "out" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadToday = async () => {
    setLoadingToday(true);
    try {
      const rec = await attendanceApi.getToday();
      setToday(rec);
    } catch {
      setToday(null);
    } finally {
      setLoadingToday(false);
    }
  };

  const loadHistory = async (m: number, y: number) => {
    setLoadingHistory(true);
    try {
      const records = await attendanceApi.getHistory({ month: m, year: y });
      setHistory(records);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadHistory(month, year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const handleCheckIn = async () => {
    setError(null);
    setActionLoading("in");
    try {
      const rec = await attendanceApi.checkIn();
      setToday(rec);
      loadHistory(month, year);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check in. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckOut = async () => {
    setError(null);
    setActionLoading("out");
    try {
      const rec = await attendanceApi.checkOut();
      setToday(rec);
      loadHistory(month, year);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check out. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const summary = useMemo(() => {
    const present = history.filter((r) => r.status === "Present").length;
    const late = history.filter((r) => r.status === "Late").length;
    const absent = history.filter((r) => r.status === "Absent").length;
    const totalHours = history.reduce((sum, r) => sum + (r.workingHours ?? 0), 0);
    const totalOvertime = history.reduce((sum, r) => sum + (r.overtimeHours ?? 0), 0);
    return {
      present,
      late,
      absent,
      totalHours: Math.round(totalHours * 10) / 10,
      totalOvertime: Math.round(totalOvertime * 10) / 10,
    };
  }, [history]);

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = [now.getFullYear(), now.getFullYear() - 1];

  return (
    <DashboardLayout title="Attendance" activeKey="attendance">
      <BackendStatusBanner status={status} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* Today's check-in/out card */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm font-medium text-gray-500">Today</p>
          <p className="mt-0.5 text-lg font-semibold text-gray-900">
            {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>

          {loadingToday ? (
            <div className="mt-6 h-24 animate-pulse rounded-xl bg-gray-100" />
          ) : (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-gray-500">
                  <LogIn size={16} /> Check-in
                </span>
                <span className="text-sm font-semibold text-gray-900">{today?.checkIn ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-gray-500">
                  <LogOut size={16} /> Check-out
                </span>
                <span className="text-sm font-semibold text-gray-900">{today?.checkOut ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock size={16} /> Working hours
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {today?.workingHours != null ? `${today.workingHours}h` : "—"}
                </span>
              </div>
              {today?.shiftName && (
                <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <CalendarDays size={16} /> Shift
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{today.shiftName}</span>
                </div>
              )}
              {today?.isOvertime && (
                <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-amber-700">
                    <Clock size={16} /> Overtime
                  </span>
                  <span className="text-sm font-semibold text-amber-700">+{today.overtimeHours}h</span>
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleCheckIn}
              disabled={!!today?.checkIn || actionLoading !== null}
              className="flex-1 rounded-full bg-gradient-to-r from-brand to-brand-dark py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {actionLoading === "in" ? "Checking in…" : "Check In"}
            </button>
            <button
              type="button"
              onClick={handleCheckOut}
              disabled={!today?.checkIn || !!today?.checkOut || actionLoading !== null}
              className="flex-1 rounded-full border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {actionLoading === "out" ? "Checking out…" : "Check Out"}
            </button>
          </div>
        </div>

        {/* History */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Attendance History</h2>
            <div className="flex items-center gap-2">
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/50"
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
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/50"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <SummaryPill label="Present" value={summary.present} tone="text-emerald-600 bg-emerald-50" />
            <SummaryPill label="Late" value={summary.late} tone="text-amber-600 bg-amber-50" />
            <SummaryPill label="Absent" value={summary.absent} tone="text-rose-600 bg-rose-50" />
            <SummaryPill label="Total hrs" value={summary.totalHours} tone="text-sky-600 bg-sky-50" />
            <SummaryPill label="Overtime hrs" value={summary.totalOvertime} tone="text-orange-600 bg-orange-50" />
          </div>

          <div className="mt-5 overflow-x-auto">
            {loadingHistory ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-11 animate-pulse rounded-lg bg-gray-100" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <EmptyState
                icon={CalendarX}
                title="No records found"
                description="There's no attendance data for the selected month."
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
                    <th className="pb-3 font-medium">Shift</th>
                    <th className="pb-3 font-medium">Check-in</th>
                    <th className="pb-3 font-medium">Check-out</th>
                    <th className="pb-3 font-medium">Hours</th>
                    <th className="pb-3 font-medium">Overtime</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.attendanceId} className="border-b border-gray-50 last:border-0">
                      <td className="py-3 font-medium text-gray-900">{formatDate(r.attendanceDate)}</td>
                      <td className="py-3 text-gray-600">{r.shiftName}</td>
                      <td className="py-3 text-gray-600">{r.checkIn ?? "—"}</td>
                      <td className="py-3 text-gray-600">{r.checkOut ?? "—"}</td>
                      <td className="py-3 text-gray-600">{r.workingHours != null ? `${r.workingHours}h` : "—"}</td>
                      <td className="py-3">
                        {r.isOvertime ? (
                          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600">
                            +{r.overtimeHours}h
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${tone}`}>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs font-medium opacity-80">{label}</p>
    </div>
  );
}
