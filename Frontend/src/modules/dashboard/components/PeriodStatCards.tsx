import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, UserCheck, UserX, ClipboardCheck, Clock3, XCircle, Users } from "lucide-react";
import { useDevAuth } from "@/app/providers/DevAuthContext";
import { adminAttendanceApi, adminLeaveApi } from "@/modules/settings/api/adminOpsApi";
import { attendanceApi, leaveApi } from "@/api/hrApi";
import { employeeService } from "@/modules/employees/api/employeeService";
import { PERIOD_OPTIONS, getPeriodRange, monthsInRange, isWithinRange, type SummaryPeriod } from "@/modules/dashboard/hooks/usePeriodRange";

type Tone = "green" | "blue" | "red" | "amber";

const TONE_CLASSES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-600",
  blue: "bg-blue-50 text-blue-600",
  red: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-600",
};

function StatTile({
  icon: Icon,
  tone,
  value,
  label,
  loading,
  error,
}: {
  icon: LucideIcon;
  tone: Tone;
  value: string;
  label: string;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {loading ? (
            <div className="h-8 w-16 animate-pulse rounded bg-gray-100" />
          ) : error ? (
            <p className="text-xs font-medium text-rose-500">Unavailable</p>
          ) : (
            <p className="truncate text-2xl font-extrabold text-gray-900 sm:text-3xl">{value}</p>
          )}
          <p className="mt-1 truncate text-xs font-medium text-gray-500 sm:text-sm">{label}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-brand" />
    </div>
  );
}

type AttendanceCounts = { present: number; absent: number; total: number };
type LeaveCounts = { approved: number; pending: number; rejected: number };

function useTotalEmployees(enabled: boolean) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; count: number | null }>({
    loading: enabled,
    error: null,
    count: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, error: null, count: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    employeeService
      .list({ status: true, limit: 1 })
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, error: null, count: res.total });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, error: "Couldn't load employee count", count: null });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}

function useAttendanceSummary(period: SummaryPeriod, enabled: boolean, selfMode: boolean) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; counts: AttendanceCounts | null }>({
    loading: enabled,
    error: null,
    counts: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, error: null, counts: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const { from, to } = getPeriodRange(period);
    const spans = monthsInRange(from, to);

    if (selfMode) {
      // Self-service: permission-free routes for the signed-in user's own data.
      Promise.all(spans.map(({ month, year }) => attendanceApi.getHistory({ month, year })))
        .then((results) => {
          if (cancelled) return;
          const rows = results.flat().filter((r) => isWithinRange(r.attendanceDate, from, to));
          const present = rows.filter((r) => r.status === "Present" || r.status === "Late" || r.status === "Half-Day").length;
          const absent = rows.filter((r) => r.status === "Absent").length;
          setState({ loading: false, error: null, counts: { present, absent, total: rows.length } });
        })
        .catch(() => {
          if (!cancelled) setState({ loading: false, error: "Couldn't load attendance", counts: null });
        });
    } else {
      // Admin: org-wide fetch (requires attendance.view).
      Promise.all(spans.map(({ month, year }) => adminAttendanceApi.list({ month, year })))
        .then((results) => {
          if (cancelled) return;
          const rows = results.flatMap((r) => r.data).filter((r) => isWithinRange(r.attendanceDate, from, to));
          const present = rows.filter((r) => r.status === "Present" || r.status === "Late" || r.status === "Half-Day").length;
          const absent = rows.filter((r) => r.status === "Absent").length;
          setState({ loading: false, error: null, counts: { present, absent, total: rows.length } });
        })
        .catch(() => {
          if (!cancelled) setState({ loading: false, error: "Couldn't load attendance", counts: null });
        });
    }

    return () => {
      cancelled = true;
    };
  }, [period, enabled, selfMode]);

  return state;
}

function useLeaveSummary(period: SummaryPeriod, enabled: boolean, selfMode: boolean) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; counts: LeaveCounts | null }>({
    loading: enabled,
    error: null,
    counts: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, error: null, counts: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const { from, to } = getPeriodRange(period);

    if (selfMode) {
      // Self-service: permission-free route for the signed-in user's own leave requests.
      leaveApi
        .getMyLeaves()
        .then((rows) => {
          if (cancelled) return;
          const filtered = rows.filter((r) => isWithinRange(r.appliedOn?.slice(0, 10) ?? "", from, to));
          const approved = filtered.filter((r) => r.status === "Approved").length;
          const pending = filtered.filter((r) => r.status === "Pending").length;
          const rejected = filtered.filter((r) => r.status === "Rejected").length;
          setState({ loading: false, error: null, counts: { approved, pending, rejected } });
        })
        .catch(() => {
          if (!cancelled) setState({ loading: false, error: "Couldn't load leave requests", counts: null });
        });
    } else {
      // Admin: org-wide fetch (requires leave-request.view).
      adminLeaveApi
        .list({})
        .then((res) => {
          if (cancelled) return;
          const rows = res.data.filter((r) => isWithinRange(r.appliedOn?.slice(0, 10) ?? "", from, to));
          const approved = rows.filter((r) => r.status === "Approved").length;
          const pending = rows.filter((r) => r.status === "Pending").length;
          const rejected = rows.filter((r) => r.status === "Rejected").length;
          setState({ loading: false, error: null, counts: { approved, pending, rejected } });
        })
        .catch(() => {
          if (!cancelled) setState({ loading: false, error: "Couldn't load leave requests", counts: null });
        });
    }

    return () => {
      cancelled = true;
    };
  }, [period, enabled, selfMode]);

  return state;
}

export default function PeriodStatCards({ employeeId }: { employeeId?: string } = {}) {
  const { hasPermission } = useDevAuth();
  const [period, setPeriod] = useState<SummaryPeriod>("daily");

  // When employeeId is set, this is "own stats" mode: use self-service routes with
  // no permission gate. When undefined, this is admin org-wide mode: use admin routes
  // gated on the respective view permissions.
  const selfMode = employeeId !== undefined;

  const canAttendance = selfMode || hasPermission("attendance.view");
  const canLeave = selfMode || hasPermission("leave-request.view");
  const canViewEmployees = !selfMode && hasPermission("employees.view");

  const attendance = useAttendanceSummary(period, canAttendance, selfMode);
  const leave = useLeaveSummary(period, canLeave, selfMode);
  const totalEmployees = useTotalEmployees(canViewEmployees);

  const attendanceRate =
    attendance.counts && attendance.counts.total > 0
      ? `${Math.round((attendance.counts.present / attendance.counts.total) * 100)}%`
      : "0%";

  const leaveTotal = leave.counts ? leave.counts.approved + leave.counts.pending + leave.counts.rejected : 0;
  const approvalRate = leave.counts && leaveTotal > 0 ? `${Math.round((leave.counts.approved / leaveTotal) * 100)}%` : "0%";

  const periodNoun = period === "daily" ? "Today" : period === "weekly" ? "This Week" : "This Month";

  // In self mode we never show the no-permission message (self-service routes don't
  // require permissions). In admin mode we show it only when none of the summary
  // permissions (attendance, leave, employees) are present.
  if (!selfMode && !hasPermission("attendance.view") && !hasPermission("leave-request.view") && !canViewEmployees) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
        Your role doesn't have permission to view attendance or leave summaries yet.
      </div>
    );
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-gray-900 sm:text-lg">Overview · {periodNoun}</h2>
        <div className="inline-flex shrink-0 rounded-full bg-gray-100 p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setPeriod(opt.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
                period === opt.key ? "bg-brand text-white shadow-sm" : "text-gray-500 hover:text-gray-800"
              }`}
              aria-pressed={period === opt.key}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {canViewEmployees && (
          <div className="grid grid-cols-1">
            <StatTile
              icon={Users}
              tone="blue"
              value={String(totalEmployees.count ?? 0)}
              label="Total Employees"
              loading={totalEmployees.loading}
              error={totalEmployees.error}
            />
          </div>
        )}

        {canAttendance && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatTile
              icon={TrendingUp}
              tone="green"
              value={attendanceRate}
              label="Attendance Rate"
              loading={attendance.loading}
              error={attendance.error}
            />
            <StatTile
              icon={UserCheck}
              tone="blue"
              value={String(attendance.counts?.present ?? 0)}
              label="Present"
              loading={attendance.loading}
              error={attendance.error}
            />
            <StatTile
              icon={UserX}
              tone="red"
              value={String(attendance.counts?.absent ?? 0)}
              label="Absent"
              loading={attendance.loading}
              error={attendance.error}
            />
          </div>
        )}

        {canLeave && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatTile
              icon={ClipboardCheck}
              tone="amber"
              value={approvalRate}
              label="Leave Approval Rate"
              loading={leave.loading}
              error={leave.error}
            />
            <StatTile
              icon={Clock3}
              tone="blue"
              value={String(leave.counts?.pending ?? 0)}
              label="Leave Pending"
              loading={leave.loading}
              error={leave.error}
            />
            <StatTile
              icon={XCircle}
              tone="red"
              value={String(leave.counts?.rejected ?? 0)}
              label="Leave Rejected"
              loading={leave.loading}
              error={leave.error}
            />
          </div>
        )}
      </div>
    </section>
  );
}
