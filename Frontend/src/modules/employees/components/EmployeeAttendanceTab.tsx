import { useEffect, useMemo, useState } from "react";
import { LogIn, LogOut, Clock, CalendarDays, CalendarX } from "lucide-react";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import { useToast } from "@/app/providers/ToastContext";
import { adminAttendanceApi, type AdminAttendanceRecord, type AdminAttendanceStatus } from "@/modules/settings/api/adminOpsApi";

const now = new Date();
const STATUS_OPTIONS: AdminAttendanceStatus[] = ["Present", "Late", "Half-Day", "Absent", "On Leave", "Leave", "Holiday"];

function formatDate(dateStr: string) {
 return new Date(dateStr).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function EmployeeAttendanceTab({ employeeId }: { employeeId: string }) {
 const toast = useToast();

 const [today, setToday] = useState<AdminAttendanceRecord | null>(null);
 const [loadingToday, setLoadingToday] = useState(true);
 const [actionLoading, setActionLoading] = useState<"in" | "out" | null>(null);

 const [history, setHistory] = useState<AdminAttendanceRecord[]>([]);
 const [loadingHistory, setLoadingHistory] = useState(true);
 const [month, setMonth] = useState(now.getMonth() + 1);
 const [year, setYear] = useState(now.getFullYear());
 const [statusFilter, setStatusFilter] = useState<AdminAttendanceStatus | "">("");

 const loadToday = () => {
 setLoadingToday(true);
 adminAttendanceApi
 .getTodayFor(employeeId)
 .then(setToday)
 .catch(() => setToday(null))
 .finally(() => setLoadingToday(false));
 };

 const loadHistory = () => {
 setLoadingHistory(true);
 adminAttendanceApi
 .list({ employeeId, month, year, status: statusFilter, pageSize: 500 })
 .then((res) => setHistory(res.data))
 .catch(() => setHistory([]))
 .finally(() => setLoadingHistory(false));
 };

 useEffect(() => {
 loadToday();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [employeeId]);

 useEffect(() => {
 loadHistory();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [employeeId, month, year, statusFilter]);

 const handleCheckIn = async () => {
 setActionLoading("in");
 try {
 const rec = await adminAttendanceApi.checkInEmployee(employeeId);
 setToday(rec);
 toast.showSuccess("Checked in.");
 loadHistory();
 } catch (err) {
 toast.showError(err instanceof Error ? err.message : "Couldn't check in. Please try again.");
 } finally {
 setActionLoading(null);
 }
 };

 const handleCheckOut = async () => {
 setActionLoading("out");
 try {
 const rec = await adminAttendanceApi.checkOutEmployee(employeeId);
 setToday(rec);
 toast.showSuccess("Checked out.");
 loadHistory();
 } catch (err) {
 toast.showError(err instanceof Error ? err.message : "Couldn't check out. Please try again.");
 } finally {
 setActionLoading(null);
 }
 };

 const summary = useMemo(() => {
 const present = history.filter((r) => r.status === "Present").length;
 const late = history.filter((r) => r.status === "Late").length;
 const absent = history.filter((r) => r.status === "Absent").length;
 const totalHours = history.reduce((sum, r) => sum + (r.workingHours ?? 0), 0);
 return {
 present,
 late,
 absent,
 totalHours: Math.round(totalHours * 10) / 10,
 };
 }, [history]);

 const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
 const yearOptions = [now.getFullYear(), now.getFullYear() - 1];

 return (
 <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
 {/* Today's check-in/out card */}
 <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
 <p className="text-sm font-medium text-gray-500">Today</p>
 <p className="mt-0.5 text-lg font-semibold text-gray-900">
 {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
 </p>

 {loadingToday ? (
 <div className="mt-6 h-20 animate-pulse rounded-xl bg-gray-100" />
 ) : (
 <div className="mt-6 space-y-3">
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
 <Clock size={16} /> Hours
 </span>
 <span className="text-sm font-semibold text-gray-900">
 {today?.workingHours != null ? `${today.workingHours}h` : "—"}
 </span>
 </div>
 </div>
 )}

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
 <h3 className="text-sm font-semibold text-gray-900">Attendance History</h3>
 <div className="flex flex-wrap items-center gap-2">
 <select
 value={month}
 onChange={(e) => setMonth(Number(e.target.value))}
 className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/50"
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
 className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/50"
 aria-label="Filter by year"
 >
 {yearOptions.map((y) => (
 <option key={y} value={y}>
 {y}
 </option>
 ))}
 </select>
 <select
 value={statusFilter}
 onChange={(e) => setStatusFilter(e.target.value as AdminAttendanceStatus | "")}
 className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/50"
 aria-label="Filter by status"
 >
 <option value="">All Status</option>
 {STATUS_OPTIONS.map((s) => (
 <option key={s} value={s}>
 {s}
 </option>
 ))}
 </select>
 </div>
 </div>

 <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
 <SummaryPill label="Present" value={summary.present} tone="text-emerald-600 bg-emerald-50" />
 <SummaryPill label="Late" value={summary.late} tone="text-amber-600 bg-amber-50" />
 <SummaryPill label="Absent" value={summary.absent} tone="text-rose-600 bg-rose-50" />
 <SummaryPill label="Total hrs" value={summary.totalHours} tone="text-sky-600 bg-sky-50" />
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
 <th className="pb-3 font-medium">Check-in</th>
 <th className="pb-3 font-medium">Check-out</th>
 <th className="pb-3 font-medium">Hours</th>
 <th className="pb-3 font-medium">Status</th>
 </tr>
 </thead>
 <tbody>
 {history.map((r) => (
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
 </div>
 </div>
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
