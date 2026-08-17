import { useCallback, useEffect, useState } from "react";
import { CalendarX, Users } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import StatusBadge from "@/components/common/StatusBadge";
import SectionTabs from "@/components/common/SectionTabs";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useAuth } from "@/app/providers/AuthContext";
import { getAttendanceTabs } from "@/config/featureTabs";
import { teamAttendanceApi, monthYearNow, type TeamMemberAttendance } from "@/modules/team/api/teamApi";

const now = new Date();

export default function TeamAttendance() {
 const status = useBackendStatus();
 const { user } = useAuth();
 const tabs = getAttendanceTabs(user?.role);

 const [data, setData] = useState<TeamMemberAttendance[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<unknown>(null);
 const [month, setMonth] = useState(monthYearNow().month);
 const [year, setYear] = useState(monthYearNow().year);
 const [expanded, setExpanded] = useState<string | null>(null);

 const load = useCallback(async () => {
 setLoading(true);
 setError(null);
 try {
 const rows = await teamAttendanceApi.getTeamAttendance({ month, year });
 setData(rows);
 } catch (err) {
 // Surface the failure instead of collapsing to an empty list — the
 // /team/attendance route 404s until the backend adds a team controller,
 // and a fake "no data" state would hide that entirely.
 setError(err);
 setData([]);
 } finally {
 setLoading(false);
 }
 }, [month, year]);

 useEffect(() => {
 load();
 }, [load]);

 const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
 const yearOptions = [now.getFullYear(), now.getFullYear() - 1];

 const teamAvgRate = data.length
 ? Math.round(data.reduce((sum, d) => sum + d.attendanceRate, 0) / data.length)
 : 0;

 return (
 <DashboardLayout title="Team Attendance" activeKey="attendance">
 <BackendStatusBanner status={status} />
 <SectionTabs tabs={tabs} active="employee-attendance" />

 <div className="flex flex-wrap items-center justify-between gap-3">
 <h2 className="text-base font-semibold text-gray-900">Team Attendance Overview</h2>
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

 {!loading && data.length > 0 && (
 <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
 <p className="text-sm font-medium text-gray-500">Team Average Attendance Rate</p>
 <p className="mt-1 text-2xl font-semibold tracking-tight text-brand-dark">{teamAvgRate}%</p>
 </div>
 )}

 <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
 {loading ? (
 <div className="space-y-2">
 {[...Array(4)].map((_, i) => (
 <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
 ))}
 </div>
 ) : error ? (
 <ErrorState error={error} title="Couldn't load team attendance" onRetry={load} />
 ) : data.length === 0 ? (
 <EmptyState icon={CalendarX} title="No attendance data" description="There's no attendance data available for the selected month." />
 ) : (
 <div className="space-y-2">
 {data.map((member) => (
 <div key={member.employeeId} className="rounded-xl border border-gray-100">
 <button
 type="button"
 onClick={() => setExpanded((cur) => (cur === member.employeeId ? null : member.employeeId))}
 className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left"
 >
 <div className="flex items-center gap-3">
 <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand-dark">
 <Users size={15} />
 </span>
 <div>
 <p className="text-sm font-semibold text-gray-900">{member.name}</p>
 <p className="text-xs text-gray-500">{member.designation} · {member.shiftName}</p>
 </div>
 </div>
 <div className="flex items-center gap-4 text-xs text-gray-500 sm:gap-6">
 <span>
 <span className="font-semibold text-emerald-600">{member.presentDays}</span> present
 </span>
 <span>
 <span className="font-semibold text-amber-600">{member.lateDays}</span> late
 </span>
 <span>
 <span className="font-semibold text-rose-600">{member.absentDays}</span> absent
 </span>
 {member.overtimeAllowed && (
 <span>
 <span className="font-semibold text-orange-600">{member.totalOvertimeHours}h</span> overtime
 </span>
 )}
 <span className="font-semibold text-gray-900">{member.attendanceRate}%</span>
 </div>
 </button>

 {expanded === member.employeeId && (
 <div className="border-t border-gray-100 px-4 py-3">
 <div className="overflow-x-auto">
 <table className="w-full min-w-[420px] text-left text-sm">
 <thead>
 <tr className="text-xs uppercase tracking-wide text-gray-400">
 <th className="pb-2 font-medium">Date</th>
 <th className="pb-2 font-medium">Check-in</th>
 <th className="pb-2 font-medium">Check-out</th>
 <th className="pb-2 font-medium">Hours</th>
 <th className="pb-2 font-medium">Overtime</th>
 <th className="pb-2 font-medium">Status</th>
 </tr>
 </thead>
 <tbody>
 {member.days.slice(-10).reverse().map((d) => (
 <tr key={d.attendanceDate} className="border-t border-gray-50">
 <td className="py-2 text-gray-700">
 {new Date(d.attendanceDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
 </td>
 <td className="py-2 text-gray-600">{d.checkIn ?? "—"}</td>
 <td className="py-2 text-gray-600">{d.checkOut ?? "—"}</td>
 <td className="py-2 text-gray-600">{d.workingHours != null ? `${d.workingHours}h` : "—"}</td>
 <td className="py-2">
 {d.isOvertime ? (
 <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600">
 +{d.overtimeHours}h
 </span>
 ) : (
 <span className="text-gray-400">—</span>
 )}
 </td>
 <td className="py-2">
 <StatusBadge status={d.status} />
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}
 </div>
 ))}
 </div>
 )}
 </div>
 </DashboardLayout>
 );
}
