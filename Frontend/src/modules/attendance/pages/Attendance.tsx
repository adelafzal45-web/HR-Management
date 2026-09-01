import { useEffect, useMemo, useState } from "react";
import {
 LogIn,
 LogOut,
 Clock,
 CalendarDays,
 CalendarX,
 CheckCircle2,
 AlertCircle,
 XCircle,
 Timer,
 Zap,
 Fingerprint,
 type LucideIcon,
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import StatusBadge from "@/components/common/StatusBadge";
import SectionTabs from "@/components/common/SectionTabs";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useAuth } from "@/app/providers/AuthContext";
import { getAttendanceTabs } from "@/config/featureTabs";
import { attendanceApi, type AttendanceRecord, type TodayAttendance } from "@/api/hrApi";

const now = new Date();

type PeriodFilter = "daily" | "weekly" | "monthly";

function formatDate(dateStr: string) {
 return new Date(dateStr).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const iso = (d: Date) =>
 `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const PERIODS: { value: PeriodFilter; label: string }[] = [
 { value: "daily", label: "Daily" },
 { value: "weekly", label: "Weekly" },
 { value: "monthly", label: "Monthly" },
];

/**
 * The date window Daily / Weekly / Monthly select inside the month on screen.
 *
 * Anchored to today only while the current month is being viewed; on any other
 * month it anchors to that month's last day (or its first, for a future month).
 * Anchoring to today unconditionally would leave Daily and Weekly permanently
 * empty the moment someone looked at March.
 *
 * The range is applied in the browser rather than by refetching, because
 * `GET /attendance/me/history` is a whole month either way — a narrower request
 * does not exist, so a round trip would buy nothing.
 */
function periodRange(period: PeriodFilter, month: number, year: number): { from: string; to: string } {
 const monthStart = new Date(year, month - 1, 1);
 const monthEnd = new Date(year, month, 0);
 const today = new Date();
 const anchor = today < monthStart ? monthStart : today > monthEnd ? monthEnd : today;

 if (period === "monthly") return { from: iso(monthStart), to: iso(monthEnd) };
 if (period === "daily") return { from: iso(anchor), to: iso(anchor) };

 const weekStart = new Date(anchor);
 weekStart.setDate(weekStart.getDate() - 6);
 return { from: iso(weekStart < monthStart ? monthStart : weekStart), to: iso(anchor) };
}

function rangeLabel(period: PeriodFilter, from: string, to: string) {
 const fmt = (s: string) => new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
 if (period === "daily") return fmt(from);
 return `${fmt(from)} – ${fmt(to)}`;
}

export default function Attendance() {
 const status = useBackendStatus();
 const { user } = useAuth();
 const tabs = getAttendanceTabs(user?.role);

 // The whole status object, not just the row: `canCheckIn`/`canCheckOut` are
 // the server's decision and are what the two buttons are enabled from.
 const [todayStatus, setTodayStatus] = useState<TodayAttendance | null>(null);
 const today = todayStatus?.attendance ?? null;
 const [history, setHistory] = useState<AttendanceRecord[]>([]);
 const [month, setMonth] = useState(now.getMonth() + 1);
 const [year, setYear] = useState(now.getFullYear());
 const [period, setPeriod] = useState<PeriodFilter>("monthly");

 const [loadingToday, setLoadingToday] = useState(true);
 const [loadingHistory, setLoadingHistory] = useState(true);
 const [actionLoading, setActionLoading] = useState<"in" | "out" | null>(null);
 const [error, setError] = useState<string | null>(null);

 // Table state. The month's rows are all in memory, so search, filters, sort
 // and paging are all applied here rather than by the server.
 const [search, setSearch] = useState("");
 const [filters, setFilters] = useState<Record<string, string>>({});
 const [sortKey, setSortKey] = useState<string>("attendanceDate");
 const [sortDir, setSortDir] = useState<"ASC" | "DESC">("DESC");
 const [page, setPage] = useState(1);
 const [pageSize, setPageSize] = useState(10);

 const loadToday = async () => {
 setLoadingToday(true);
 try {
 setTodayStatus(await attendanceApi.getToday());
 } catch {
 setTodayStatus(null);
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
 await attendanceApi.checkIn();
 // Refetch rather than folding the returned row into state: the two
 // can-do flags are the server's call, and re-deriving them here is how
 // the old screen ended up disagreeing with it.
 await loadToday();
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
 await attendanceApi.checkOut();
 await loadToday();
 loadHistory(month, year);
 } catch (err) {
 setError(err instanceof Error ? err.message : "Couldn't check out. Please try again.");
 } finally {
 setActionLoading(null);
 }
 };

 const range = useMemo(() => periodRange(period, month, year), [period, month, year]);

 // Everything below the cards reflects the selected period, so the numbers on
 // top and the rows underneath can never describe different spans of time.
 const inPeriod = useMemo(
  () => history.filter((r) => r.attendanceDate >= range.from && r.attendanceDate <= range.to),
  [history, range],
 );

 const summary = useMemo(() => {
  const present = inPeriod.filter((r) => r.status === "Present").length;
  const late = inPeriod.filter((r) => r.status === "Late").length;
  const absent = inPeriod.filter((r) => r.status === "Absent").length;
  const totalHours = inPeriod.reduce((sum, r) => sum + (r.workingHours ?? 0), 0);
  const totalOvertime = inPeriod.reduce((sum, r) => sum + (r.overtimeHours ?? 0), 0);
  return {
   present,
   late,
   absent,
   totalHours: Math.round(totalHours * 10) / 10,
   totalOvertime: Math.round(totalOvertime * 10) / 10,
  };
 }, [inPeriod]);

 const shiftOptions = useMemo(() => {
  const names = [...new Set(history.map((r) => r.shiftName).filter((n) => n && n !== "—"))];
  return names.sort().map((n) => ({ value: n, label: n }));
 }, [history]);

 const statusOptions = useMemo(() => {
  const values = [...new Set(history.map((r) => r.status).filter(Boolean))];
  return values.sort().map((s) => ({ value: s, label: s }));
 }, [history]);

 const visible = useMemo(() => {
  const term = search.trim().toLowerCase();
  const rows = inPeriod.filter((r) => {
   if (filters.status && r.status !== filters.status) return false;
   if (filters.shift && r.shiftName !== filters.shift) return false;
   if (!term) return true;
   return [formatDate(r.attendanceDate), r.shiftName, r.status, r.checkIn ?? "", r.checkOut ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(term);
  });

  const dir = sortDir === "ASC" ? 1 : -1;
  return [...rows].sort((a, b) => {
   if (sortKey === "workingHours") return ((a.workingHours ?? 0) - (b.workingHours ?? 0)) * dir;
   if (sortKey === "overtimeHours") return ((a.overtimeHours ?? 0) - (b.overtimeHours ?? 0)) * dir;
   if (sortKey === "status") return a.status.localeCompare(b.status) * dir;
   return a.attendanceDate.localeCompare(b.attendanceDate) * dir;
  });
 }, [inPeriod, search, filters, sortKey, sortDir]);

 const paged = useMemo(
  () => visible.slice((page - 1) * pageSize, page * pageSize),
  [visible, page, pageSize],
 );

 // Any narrowing can strand the viewer on a page that no longer exists.
 useEffect(() => setPage(1), [period, month, year, search, filters, pageSize]);

 const columns: DataTableColumn<AttendanceRecord>[] = [
  {
   key: "attendanceDate",
   label: "Date",
   sortable: true,
   render: (r) => <span className="font-medium text-gray-900">{formatDate(r.attendanceDate)}</span>,
  },
  {
   key: "shift",
   label: "Shift",
   filterable: true,
   filterOptions: shiftOptions,
   hideBelow: "md",
   render: (r) => r.shiftName,
  },
  { key: "checkIn", label: "Check-in", render: (r) => r.checkIn ?? <span className="text-gray-400">—</span> },
  { key: "checkOut", label: "Check-out", render: (r) => r.checkOut ?? <span className="text-gray-400">—</span> },
  {
   key: "workingHours",
   label: "Hours",
   sortable: true,
   render: (r) => (r.workingHours != null ? `${r.workingHours}h` : <span className="text-gray-400">—</span>),
  },
  {
   key: "overtimeHours",
   label: "Overtime",
   sortable: true,
   hideBelow: "lg",
   render: (r) =>
    r.isOvertime ? (
     <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600">
      +{r.overtimeHours}h
     </span>
    ) : (
     <span className="text-gray-400">—</span>
    ),
  },
  {
   key: "status",
   label: "Status",
   filterable: true,
   filterOptions: statusOptions,
   render: (r) => <StatusBadge status={r.status} />,
  },
 ];

 const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
 const yearOptions = [now.getFullYear(), now.getFullYear() - 1];

 return (
 <DashboardLayout title="Attendance" activeKey="attendance">
 <BackendStatusBanner status={status} />
 <SectionTabs tabs={tabs} active="daily-attendance" />

 {/* Summary across the top. The figures follow the period pills on the right,
 so the cards and the rows underneath always describe the same span. */}
 <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
 <SummaryCard icon={CheckCircle2} label="Present" value={summary.present} tone="emerald" />
 <SummaryCard icon={AlertCircle} label="Late" value={summary.late} tone="amber" />
 <SummaryCard icon={XCircle} label="Absent" value={summary.absent} tone="rose" />
 <SummaryCard icon={Timer} label="Total hrs" value={summary.totalHours} tone="sky" />
 <SummaryCard icon={Zap} label="Overtime hrs" value={summary.totalOvertime} tone="orange" />
 </div>

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
 {/* The shift comes from the status object, so it shows before the first
 check-in too — it's the employee's assigned shift, not just whatever
 shift happens to be stamped on today's row. */}
 {(today?.shiftName ?? todayStatus?.shiftName) && (
 <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
 <span className="flex items-center gap-2 text-sm text-gray-500">
 <CalendarDays size={16} /> Shift
 </span>
 <span className="text-sm font-semibold text-gray-900">
 {today?.shiftName ?? todayStatus?.shiftName}
 {todayStatus?.shiftStart && todayStatus?.shiftEnd
 ? ` · ${todayStatus.shiftStart}–${todayStatus.shiftEnd}`
 : ""}
 </span>
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

 {/* Not a blocker — checking in on a non-working day is allowed (weekend
 cover, callout) and the server permits it. This only explains why the
 day won't count as an absence if nothing is recorded. */}
 {!loadingToday && todayStatus && !todayStatus.isWorkingDay && (
 <p className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-700">
 Today isn't a working day on your schedule. You can still check in if you're working.
 </p>
 )}

 {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

 {/* In Device mode the terminal is the sanctioned way in: the server has
 already forced canCheckIn/canCheckOut false, so replace the buttons with a
 banner carrying its verbatim reason rather than showing two dead controls. */}
 {todayStatus?.selfServiceDisabledReason ? (
 <div className="mt-6 flex items-start gap-3 rounded-xl bg-sky-50 px-4 py-3.5 text-sm">
 <Fingerprint size={18} className="mt-0.5 shrink-0 text-sky-600" />
 <div>
 <p className="font-semibold text-sky-800">Attendance is recorded on the biometric device</p>
 <p className="mt-0.5 text-sky-700">{todayStatus.selfServiceDisabledReason}</p>
 </div>
 </div>
 ) : (
 <div className="mt-6 flex gap-3">
 <button
 type="button"
 onClick={handleCheckIn}
 disabled={!todayStatus?.canCheckIn || actionLoading !== null}
 className="flex-1 rounded-full bg-gradient-to-r from-brand to-brand-dark py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
 >
 {actionLoading === "in" ? "Checking in…" : "Check In"}
 </button>
 <button
 type="button"
 onClick={handleCheckOut}
 disabled={!todayStatus?.canCheckOut || actionLoading !== null}
 className="flex-1 rounded-full border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
 >
 {actionLoading === "out" ? "Checking out…" : "Check Out"}
 </button>
 </div>
 )}
 </div>

 {/* History */}
 <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
 <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
 <div>
 <h2 className="text-base font-semibold text-gray-900">Attendance History</h2>
 <p className="mt-0.5 text-xs text-gray-500">{rangeLabel(period, range.from, range.to)}</p>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 {/* Reads as a row of buttons but behaves as one filter control: a
 radiogroup, so arrow keys and screen readers treat the three as a
 single choice rather than three unrelated actions. */}
 <div role="radiogroup" aria-label="Period" className="flex rounded-full bg-gray-100 p-1">
 {PERIODS.map((p) => (
 <button
 key={p.value}
 type="button"
 role="radio"
 aria-checked={period === p.value}
 onClick={() => setPeriod(p.value)}
 className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
 period === p.value
 ? "bg-white text-gray-900 shadow-sm"
 : "text-gray-500 hover:text-gray-800"
 }`}
 >
 {p.label}
 </button>
 ))}
 </div>
 <select
 value={month}
 onChange={(e) => setMonth(Number(e.target.value))}
 aria-label="Month"
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
 aria-label="Year"
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

 <DataTable
 columns={columns}
 rows={paged}
 rowKey={(r) => r.attendanceId}
 loading={loadingHistory}
 search={search}
 onSearchChange={setSearch}
 searchPlaceholder="Search attendance…"
 emptyIcon={CalendarX}
 emptyTitle="No records found"
 emptyDescription="There's no attendance data for the selected period."
 page={page}
 pageSize={pageSize}
 onPageSizeChange={setPageSize}
 pageSizeOptions={[10, 25, 50]}
 total={visible.length}
 onPageChange={setPage}
 sortKey={sortKey}
 sortDir={sortDir}
 onSortChange={(key, dir) => {
 setSortKey(key);
 setSortDir(dir);
 }}
 filters={filters}
 onFiltersChange={setFilters}
 unifiedFilter
 sortOptions={[
 { value: "attendanceDate", label: "Date" },
 { value: "workingHours", label: "Hours" },
 { value: "overtimeHours", label: "Overtime" },
 { value: "status", label: "Status" },
 ]}
 />
 </div>
 </div>
 </DashboardLayout>
 );
}

function SummaryCard({
 icon: Icon,
 label,
 value,
 tone,
}: {
 icon: LucideIcon;
 label: string;
 value: number;
 tone: "emerald" | "amber" | "rose" | "sky" | "orange";
}) {
 const tones: Record<string, string> = {
 emerald: "bg-emerald-50 text-emerald-600",
 amber: "bg-amber-50 text-amber-600",
 rose: "bg-rose-50 text-rose-600",
 sky: "bg-sky-50 text-sky-600",
 orange: "bg-orange-50 text-orange-600",
 };

 return (
 <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
 <div className="min-w-0">
 <p className="text-2xl font-semibold leading-none text-gray-900">{value}</p>
 <p className="mt-1.5 truncate text-xs font-medium text-gray-500">{label}</p>
 </div>
 <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
 <Icon size={18} />
 </span>
 </div>
 );
}
