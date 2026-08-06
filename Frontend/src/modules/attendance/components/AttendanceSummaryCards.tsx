// Summary card row for the Attendance Records page. Shows Present / Late /
// Absent / On-Leave counts plus the attendance rate for a Daily / Weekly /
// Monthly window, driven by its own segmented toggle on the right.
//
// It honours the page's current Department / Employee filter so the cards
// describe the same population the table below is showing, but it computes its
// own date window (independent of the table's single-date filter) because the
// point of the toggle is to summarise a period, not one day.

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, UserCheck, Clock3, UserX, CalendarOff } from "lucide-react";
import { adminAttendanceApi } from "@/modules/settings/api/adminOpsApi";
import {
 PERIOD_OPTIONS,
 getPeriodRange,
 monthsInRange,
 isWithinRange,
 type SummaryPeriod,
} from "@/modules/dashboard/hooks/usePeriodRange";

type Tone = "green" | "blue" | "amber" | "red" | "gray";

const TONE_CLASSES: Record<Tone, string> = {
 green: "bg-emerald-50 text-emerald-600",
 blue: "bg-blue-50 text-blue-600",
 amber: "bg-amber-50 text-amber-600",
 red: "bg-rose-50 text-rose-600",
 gray: "bg-gray-100 text-gray-500",
};

type Counts = { present: number; late: number; absent: number; onLeave: number; total: number };

function StatTile({
 icon: Icon,
 tone,
 value,
 label,
 loading,
}: {
 icon: LucideIcon;
 tone: Tone;
 value: string;
 label: string;
 loading?: boolean;
}) {
 return (
 <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 {loading ? (
 <div className="h-7 w-14 animate-pulse rounded bg-gray-100" />
 ) : (
 <p className="truncate text-2xl font-extrabold text-gray-900">{value}</p>
 )}
 <p className="mt-1 truncate text-xs font-medium text-gray-500">{label}</p>
 </div>
 <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}>
 <Icon size={17} />
 </span>
 </div>
 <span className="absolute inset-x-0 bottom-0 h-1 bg-brand" />
 </div>
 );
}

export default function AttendanceSummaryCards({
 departmentId,
 employeeId,
}: {
 departmentId?: string;
 employeeId?: string;
}) {
 const [period, setPeriod] = useState<SummaryPeriod>("daily");
 const [counts, setCounts] = useState<Counts | null>(null);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 let cancelled = false;
 setLoading(true);

 const { from, to } = getPeriodRange(period);
 const spans = monthsInRange(from, to);

 Promise.all(spans.map(({ month, year }) => adminAttendanceApi.list({ month, year, departmentId, employeeId })))
 .then((results) => {
 if (cancelled) return;
 const rows = results.flatMap((r) => r.data).filter((r) => isWithinRange(r.attendanceDate, from, to));
 setCounts({
 present: rows.filter((r) => r.status === "Present").length,
 late: rows.filter((r) => r.status === "Late").length,
 absent: rows.filter((r) => r.status === "Absent").length,
 onLeave: rows.filter((r) => r.status === "On Leave" || r.status === "Leave").length,
 total: rows.length,
 });
 setLoading(false);
 })
 .catch(() => {
 if (!cancelled) {
 setCounts(null);
 setLoading(false);
 }
 });

 return () => {
 cancelled = true;
 };
 }, [period, departmentId, employeeId]);

 const present = counts?.present ?? 0;
 const late = counts?.late ?? 0;
 const total = counts?.total ?? 0;
 // Late still counts as "showed up" for the attendance rate.
 const rate = total > 0 ? `${Math.round(((present + late) / total) * 100)}%` : "0%";
 const periodNoun = period === "daily" ? "Today" : period === "weekly" ? "This Week" : "This Month";

 return (
 <section className="mb-5">
 <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
 <h2 className="text-sm font-bold text-gray-900 sm:text-base">Attendance Summary · {periodNoun}</h2>
 <div className="inline-flex shrink-0 rounded-full bg-gray-100 p-1">
 {PERIOD_OPTIONS.map((opt) => (
 <button
 key={opt.key}
 type="button"
 onClick={() => setPeriod(opt.key)}
 className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
 period === opt.key ? "bg-brand text-white shadow-sm" : "text-gray-500 hover:text-gray-800"
 }`}
 aria-pressed={period === opt.key}
 >
 {opt.label}
 </button>
 ))}
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
 <StatTile icon={TrendingUp} tone="green" value={rate} label="Attendance Rate" loading={loading} />
 <StatTile icon={UserCheck} tone="blue" value={String(present)} label="Present" loading={loading} />
 <StatTile icon={Clock3} tone="amber" value={String(late)} label="Late" loading={loading} />
 <StatTile icon={UserX} tone="red" value={String(counts?.absent ?? 0)} label="Absent" loading={loading} />
 <StatTile icon={CalendarOff} tone="gray" value={String(counts?.onLeave ?? 0)} label="On Leave" loading={loading} />
 </div>
 </section>
 );
}
