import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CalendarOff,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Gauge,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
  Wallet,
} from "lucide-react";
import { ApiError } from "@/lib/apiClient";
import { money } from "@/modules/payroll/utils/format";
import {
  dashboardApi,
  type AdminDashboard,
  type SelfDashboard,
  type TeamDashboard,
} from "@/modules/dashboard/api/dashboardApi";

// ============================================================================
// The dashboard stat cards, one fixed set per role, every figure from the
// backend dashboard aggregates (GET /dashboard/admin | /team | /me).
//
// These used to be assembled in the browser: fetch a month of attendance rows,
// fetch leave requests, count them client-side. That could not express the set
// the product asks for. "Working Days (Till Today)" has to resolve the
// designation -> department -> global working-week ladder and subtract holidays,
// and both of those reads are gated on `working-days.view` — a permission an
// Employee does not hold. So the counting moved server-side, where it uses the
// very same services the Attendance and Appraisal screens use; a tile can no
// longer disagree with the screen it links to.
//
// Each set is pinned to the period its labels claim: the admin counters are
// "today", the team and self figures are month-to-date. There is deliberately no
// daily/weekly/monthly switch any more — it would have to silently redefine
// "Present Today" to mean something else.
// ============================================================================

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
  hint,
  loading,
  error,
}: {
  icon: LucideIcon;
  tone: Tone;
  value: string;
  label: string;
  hint?: string | null;
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
            <p className="text-xs font-medium text-rose-500">{error}</p>
          ) : (
            <p className="truncate text-2xl font-extrabold text-gray-900 sm:text-3xl">{value}</p>
          )}
          <p className="mt-1 truncate text-xs font-medium text-gray-500 sm:text-sm">{label}</p>
          {hint && !loading && !error && (
            <p className="mt-0.5 truncate text-[11px] text-gray-400">{hint}</p>
          )}
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-brand" />
    </div>
  );
}

/** Which card set to render. Chosen by role, not by permission — see RbacDashboard. */
export type StatCardsVariant = "admin" | "team" | "self";

type State = {
  loading: boolean;
  admin: AdminDashboard | null;
  self: SelfDashboard | null;
  team: TeamDashboard | null;
  adminError: string | null;
  selfError: string | null;
  teamError: string | null;
};

const EMPTY: State = {
  loading: true,
  admin: null,
  self: null,
  team: null,
  adminError: null,
  selfError: null,
  teamError: null,
};

function describe(reason: unknown): string {
  if (reason instanceof ApiError) {
    return reason.status === 403 ? "Not permitted" : `Unavailable (${reason.status})`;
  }
  return "Unavailable";
}

/**
 * Loads exactly the aggregates the variant needs, and settles each one
 * independently: a Team Lead whose role is missing `appraisal.view` still gets
 * their own figures instead of an all-or-nothing error.
 */
function useDashboardData(variant: StatCardsVariant): State {
  const [state, setState] = useState<State>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    setState({ ...EMPTY, loading: true });

    const wantsSelf = variant === "self" || variant === "team";
    const adminReq = variant === "admin" ? dashboardApi.getAdmin() : Promise.resolve(null);
    const selfReq = wantsSelf ? dashboardApi.getMine() : Promise.resolve(null);
    const teamReq = variant === "team" ? dashboardApi.getTeam() : Promise.resolve(null);

    Promise.allSettled([adminReq, selfReq, teamReq]).then(([a, s, t]) => {
      if (cancelled) return;
      setState({
        loading: false,
        admin: a.status === "fulfilled" ? a.value : null,
        self: s.status === "fulfilled" ? s.value : null,
        team: t.status === "fulfilled" ? t.value : null,
        adminError: a.status === "rejected" ? describe(a.reason) : null,
        selfError: s.status === "rejected" ? describe(s.reason) : null,
        teamError: t.status === "rejected" ? describe(t.reason) : null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [variant]);

  return state;
}

const count = (n: number | null | undefined) => String(n ?? 0);

/** Appraisal scores are stored as `total_score_percentage`, so they read as a %. */
const percent = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";

/** "of 22 working days" hint, so a count is always readable against its denominator. */
const outOf = (total: number) => `of ${total} working ${total === 1 ? "day" : "days"}`;

export default function PeriodStatCards({ variant }: { variant: StatCardsVariant }) {
  const { loading, admin, self, team, adminError, selfError, teamError } = useDashboardData(variant);

  const heading = variant === "admin" ? "Overview · Today" : "Overview · This Month";

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-gray-900 sm:text-lg">{heading}</h2>
        {variant !== "admin" && self && (
          <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
            {self.attendance.from} → {self.attendance.to}
          </span>
        )}
      </div>

      <div className="space-y-4">
        {variant === "admin" && (
          <AdminCards data={admin} loading={loading} error={adminError} />
        )}

        {variant === "team" && (
          <TeamCards team={team} loading={loading} error={teamError} />
        )}

        {variant !== "admin" && (
          <SelfCards data={self} loading={loading} error={selfError} />
        )}

        {variant === "team" && (
          <TeamAppraisalCards team={team} loading={loading} error={teamError} />
        )}
      </div>
    </section>
  );
}

/** Org-wide counters, all "as of today". */
function AdminCards({
  data,
  loading,
  error,
}: {
  data: AdminDashboard | null;
  loading: boolean;
  error: string | null;
}) {
  const common = { loading, error };
  return (
    <>
      <div className="grid grid-cols-1">
        <StatTile
          {...common}
          icon={Users}
          tone="blue"
          value={count(data?.total_employees)}
          label="Total Employees"
          hint={data ? `as of ${data.as_of}` : null}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatTile
          {...common}
          icon={UserCheck}
          tone="green"
          value={count(data?.present_today)}
          label="Present Today"
        />
        <StatTile
          {...common}
          icon={UserX}
          tone="red"
          value={count(data?.absent_today)}
          label="Absent Today"
        />
        <StatTile
          {...common}
          icon={CalendarOff}
          tone="amber"
          value={count(data?.on_leave_today)}
          label="On Leave Today"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatTile
          {...common}
          icon={Clock3}
          tone="amber"
          value={count(data?.pending_leave_requests)}
          label="Pending Leave Requests"
          hint="awaiting a decision"
        />
        <StatTile
          {...common}
          icon={ClipboardCheck}
          tone="blue"
          value={count(data?.pending_appraisals)}
          label="Pending Appraisals"
          hint="draft appraisal forms"
        />
      </div>
    </>
  );
}

/** The signed-in user's own month-to-date figures, shared by Employee and Team Lead. */
function SelfCards({
  data,
  loading,
  error,
}: {
  data: SelfDashboard | null;
  loading: boolean;
  error: string | null;
}) {
  const common = { loading, error };
  const att = data?.attendance;
  const workingDays = att?.working_days ?? 0;
  const pay = data?.payroll;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatTile
          {...common}
          icon={TrendingUp}
          tone="green"
          value={percent(data?.appraisal.today_score ?? null)}
          label="Appraisal Performance Today"
          hint={data?.appraisal.today_score === null ? "no appraisal dated today" : null}
        />
        <StatTile
          {...common}
          icon={Gauge}
          tone="blue"
          value={percent(data?.appraisal.monthly_average ?? null)}
          label="Monthly Average Performance"
          hint={
            data
              ? data.appraisal.scored_this_month === 0
                ? "nothing scored this month"
                : `${data.appraisal.scored_this_month} scored this month`
              : null
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatTile
          {...common}
          icon={CalendarDays}
          tone="blue"
          value={count(workingDays)}
          label="Working Days (Till Today)"
          hint="weekends & holidays excluded"
        />
        <StatTile
          {...common}
          icon={UserCheck}
          tone="green"
          value={count(att?.present_days)}
          label="Presents (This Month)"
          hint={att ? outOf(workingDays) : null}
        />
        <StatTile
          {...common}
          icon={UserX}
          tone="red"
          value={count(att?.absent_days)}
          label="Absents (This Month)"
          hint={att && att.late_days > 0 ? `${att.late_days} late` : null}
        />
        <StatTile
          {...common}
          icon={CalendarOff}
          tone="amber"
          value={count(att?.leave_days)}
          label="Leaves (This Month)"
          hint="approved leave days"
        />
      </div>

      <div className="grid grid-cols-1">
        <StatTile
          {...common}
          icon={Wallet}
          tone="green"
          value={
            pay && pay.visible && pay.net_salary !== null
              ? money(pay.net_salary, pay.currency)
              : "—"
          }
          label="Payroll"
          hint={
            !pay
              ? null
              : !pay.visible
                ? "payslip self-service is turned off"
                : pay.net_salary === null
                  ? "no payslip generated yet"
                  : `net pay · ${pay.period_name ?? "latest period"}${
                      pay.pay_date ? ` · paid ${pay.pay_date}` : ""
                    }`
          }
        />
      </div>
    </>
  );
}

/** The lead's window onto their roster: the team-wide appraisal mean. */
function TeamCards({
  team,
  loading,
  error,
}: {
  team: TeamDashboard | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="grid grid-cols-1">
      <StatTile
        loading={loading}
        error={error}
        icon={Users}
        tone="blue"
        value={percent(team?.team_performance_mean ?? null)}
        label="Appraisal Performance Mean (Team)"
        hint={
          team
            ? team.team_size === 0
              ? "no team members assigned yet"
              : `across ${team.team_size} team ${team.team_size === 1 ? "member" : "members"}`
            : null
        }
      />
    </div>
  );
}

/** Appraisal workload for the roster: one expected per member, pending = unscored. */
function TeamAppraisalCards({
  team,
  loading,
  error,
}: {
  team: TeamDashboard | null;
  loading: boolean;
  error: string | null;
}) {
  const common = { loading, error };
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <StatTile
        {...common}
        icon={ClipboardList}
        tone="blue"
        value={count(team?.expected_appraisals)}
        label="Expected Appraisals"
        hint="one per team member this month"
      />
      <StatTile
        {...common}
        icon={ClipboardCheck}
        tone="amber"
        value={count(team?.pending_appraisals)}
        label="Pending Appraisals"
        hint="team members with no score yet"
      />
    </div>
  );
}
