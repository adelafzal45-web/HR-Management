import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Mail, ClipboardCheck, AlertCircle, CheckCircle2, XCircle, TrendingUp,
  Building2, IdCard, Search, X, Clock, Target, GitCompare,
  Loader2,
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import KpiCard from "@/components/common/KpiCard";
import SidePanel from "@/components/dialogs/SidePanel";
import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import {
  teamAppraisalApi, appraisalStatsApi,
  type TeamMember, type TeamStats, type CompareResult,
} from "@/modules/appraisal/api/appraisalApi";
import CompareResultView from "@/modules/appraisal/components/CompareResultView";
import { formatDisplayDate } from "@/utils/formatDate";

/*
 * Client-side filtering is correct here and only here: `GET /appraisal/my-team`
 * returns the lead's entire roster in one unpaginated response (it is bounded by
 * the roster itself, not by a page size), so there is nothing to ask the server
 * to narrow. The Results table, which pages over every review in the
 * organisation, does the opposite and filters server-side.
 */
type Filters = {
  search: string;
  department: string;
  designation: string;
  evaluationStatus: string;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  department: "",
  designation: "",
  evaluationStatus: "",
};

const GRAINS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
] as const;

type Grain = (typeof GRAINS)[number]["key"];

/**
 * Start of the current Daily / Weekly / Monthly window, in local time.
 *
 * The grain is applied to the roster's own `lastReviewedAt` rather than asked of
 * the API: `GET /appraisal/team-stats` and the dashboard counts are all-time and
 * take no period argument, so scoping them client-side is the only way to say
 * "reviewed this week" without inventing a parameter the backend ignores.
 * Weeks start Monday, matching the ISO periods the scheduler names reviews with.
 */
function windowStart(grain: Grain): Date {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (grain === "weekly") {
    const weekday = start.getDay() || 7; // Sunday is 0 in JS, 7 in ISO.
    start.setDate(start.getDate() - (weekday - 1));
  } else if (grain === "monthly") {
    start.setDate(1);
  }
  return start;
}

const GRAIN_NOUN: Record<Grain, string> = {
  daily: "today",
  weekly: "this week",
  monthly: "this month",
};

/** `/appraisal/compare` rejects fewer than 2 and more than 6; mirror both here. */
const COMPARE_MIN = 2;
const COMPARE_MAX = 6;

export default function TeamMembers() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { showError } = useToast();
  /*
   * The same screen serves two scopes. `GET /appraisal/my-team` returns a Team
   * Lead's roster or, for an `appraisal.viewAll` holder, every active employee —
   * so the wording has to follow the response rather than assume a roster.
   * Calling an admin's org-wide list "your team" would misstate what they are
   * about to score.
   */
  const orgWide = hasPermission("appraisal.viewAll");
  const noun = orgWide ? "employee" : "member";
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [grain, setGrain] = useState<Grain>("daily");

  /*
   * Compare, driven off the roster rather than a separate picker. The Compare
   * page asks for a department first because it starts from the whole
   * organisation; here the lead is already looking at exactly the people they
   * can compare, so ticking cards is the shorter path to the same endpoint.
   */
  const canCompare = hasPermission("appraisal.compare");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    teamAppraisalApi
      .getMyTeam()
      .then(setMembers)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your team."))
      .finally(() => setLoading(false));

    // Stats are supplementary — a failure here shouldn't blank the roster.
    teamAppraisalApi.getTeamStats().then(setStats).catch(() => {});
  }, []);

  const statusIcon = (status: TeamMember["evaluationStatus"]) => {
    if (status === "Completed") return <CheckCircle2 size={14} className="text-green-600" />;
    if (status === "Pending") return <AlertCircle size={14} className="text-amber-600" />;
    return <XCircle size={14} className="text-gray-400" />;
  };

  // Options are derived from the roster rather than from /departments, so the
  // dropdowns only ever offer values that would actually match a row.
  const departmentOptions = useMemo(
    () => [...new Set(members.map((m) => m.department).filter(Boolean))].sort(),
    [members],
  );
  const designationOptions = useMemo(
    () => [...new Set(members.map((m) => m.designation).filter(Boolean))].sort(),
    [members],
  );

  const visible = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return members.filter((m) => {
      if (filters.department && m.department !== filters.department) return false;
      if (filters.designation && m.designation !== filters.designation) return false;
      if (filters.evaluationStatus && m.evaluationStatus !== filters.evaluationStatus) return false;
      if (!term) return true;
      return (
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(term) ||
        m.employeeCode.toLowerCase().includes(term) ||
        m.email.toLowerCase().includes(term)
      );
    });
  }, [members, filters]);

  const activeFilterCount =
    (filters.search.trim() ? 1 : 0) +
    (filters.department ? 1 : 0) +
    (filters.designation ? 1 : 0) +
    (filters.evaluationStatus ? 1 : 0);

  /*
   * The summary follows the grain, computed from the roster rather than from
   * `stats` / `dashboard`: those two are all-time and cannot be re-scoped, so
   * mixing them into a "this week" card would put an all-time number under a
   * period label. Both are still shown in their own sections, unscoped.
   */
  const periodStats = useMemo(() => {
    const since = windowStart(grain);
    const reviewedInPeriod = members.filter((m) => {
      if (!m.lastReviewedAt) return false;
      const at = new Date(m.lastReviewedAt);
      return !Number.isNaN(at.getTime()) && at >= since;
    });
    const scored = reviewedInPeriod.filter(
      (m): m is TeamMember & { lastScore: number } => typeof m.lastScore === "number",
    );
    const evaluable = members.filter((m) => m.evaluationStatus !== "Unassigned");

    return {
      rosterSize: members.length,
      reviewed: reviewedInPeriod.length,
      awaiting: evaluable.length - reviewedInPeriod.length,
      coverage: evaluable.length
        ? Math.round((reviewedInPeriod.length / evaluable.length) * 100)
        : 0,
      averageScore: scored.length
        ? Math.round(scored.reduce((sum, m) => sum + m.lastScore, 0) / scored.length)
        : null,
    };
  }, [members, grain]);

  // The roster carries `evaluationStatus`, which is where a pending count that
  // matches the cards on screen has to come from; the dashboard's `pending`
  // counts reviews and can legitimately differ, so both are shown separately
  // rather than one being presented as the other.
  const pendingOnRoster = members.filter((m) => m.evaluationStatus === "Pending");
  const firstPending = pendingOnRoster[0];

  const toggleCompare = (employeeId: string) =>
    setCompareIds((prev) =>
      prev.includes(employeeId)
        ? prev.filter((id) => id !== employeeId)
        : prev.length >= COMPARE_MAX
          ? prev
          : [...prev, employeeId],
    );

  const runCompare = () => {
    if (compareIds.length < COMPARE_MIN) return;
    setCompareOpen(true);
    setComparing(true);
    setCompareResult(null);
    appraisalStatsApi
      .compare(compareIds, {})
      .then(setCompareResult)
      .catch((err) =>
        showError(
          err instanceof Error ? err.message : "Could not compare the selected employees.",
        ),
      )
      .finally(() => setComparing(false));
  };

  const compareNames = compareIds
    .map((id) => {
      const member = members.find((m) => m.employeeId === id);
      return member ? `${member.firstName} ${member.lastName}` : null;
    })
    .filter(Boolean)
    .join(", ");

  return (
    <DashboardLayout title={orgWide ? "Evaluate Employees" : "My Team"} activeKey="employees">
      <LoadingOverlay show={loading} label={orgWide ? "Loading employees…" : "Loading your team…"} />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ---------------- Period summary + grain toggle ---------------- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Evaluation summary</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Review coverage for {GRAIN_NOUN[grain]}, across {periodStats.rosterSize}{" "}
            {noun}
            {periodStats.rosterSize === 1 ? "" : "s"}
          </p>
        </div>
        <div role="group" aria-label="Summary period" className="flex rounded-xl bg-gray-100 p-0.5">
          {GRAINS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setGrain(key)}
              aria-pressed={grain === key}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                grain === key
                  ? "bg-white text-brand-dark shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={orgWide ? "Employees" : "Team size"}
          value={periodStats.rosterSize}
          icon={Users}
          hint={`On your ${orgWide ? "list" : "roster"}`}
        />
        <KpiCard
          label="Evaluated"
          value={periodStats.reviewed}
          icon={CheckCircle2}
          tone="green"
          hint={`Reviewed ${GRAIN_NOUN[grain]}`}
        />
        <KpiCard
          label="Awaiting review"
          value={Math.max(periodStats.awaiting, 0)}
          icon={Clock}
          tone="amber"
          hint={`Still open ${GRAIN_NOUN[grain]}`}
          onClick={() => setFilters((p) => ({ ...p, evaluationStatus: "Pending" }))}
        />
        <KpiCard
          label="Coverage"
          value={`${periodStats.coverage}%`}
          icon={Target}
          tone="blue"
          hint={
            periodStats.averageScore !== null
              ? `Avg. score ${periodStats.averageScore}%`
              : "No scores yet"
          }
        />
      </div>

      {/*
        All-time performance. Deliberately does NOT repeat team size or the
        evaluated / pending counts — those are already on the period summary
        above, and repeating them at a third scope is how a reader ends up
        trusting the wrong number.
      */}
      {stats && (
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <TrendingUp size={15} className="text-brand-dark" /> Performance
              <span className="text-xs font-normal text-gray-400">· all time</span>
            </h3>
            {stats.averageScore !== null && (
              <p className="text-sm text-gray-600">
                Average score <strong className="text-gray-900">{stats.averageScore}%</strong>
              </p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-gray-500">Evaluated</p>
              <p className="mt-0.5 text-xl font-semibold text-emerald-600">{stats.evaluated}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Pending</p>
              <p className="mt-0.5 text-xl font-semibold text-amber-600">{stats.pending}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Completion</p>
              <p className="mt-0.5 text-xl font-semibold text-gray-900">{stats.completionRate}%</p>
            </div>
          </div>

          {stats.distribution.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
              {stats.distribution.map((d) => (
                <span
                  key={d.band}
                  className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600"
                >
                  {d.band}: {d.count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Daily pending alert + quick submit ---------------- */}
      {!loading && pendingOnRoster.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
          <Clock size={16} className="shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1 text-sm text-amber-800">
            <strong>
              {pendingOnRoster.length} evaluation{pendingOnRoster.length === 1 ? "" : "s"} pending
            </strong>{" "}
            for today. Submissions lock once sent — reopening them needs HR.
          </p>
          {firstPending && (
            <button
              type="button"
              onClick={() => navigate(`/team/evaluate/${firstPending.employeeId}`)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand-dark px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
            >
              <ClipboardCheck size={14} />
              Start with {firstPending.firstName}
            </button>
          )}
        </div>
      )}

      {/* ---------------- Roster filters ---------------- */}
      <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[200px] flex-1">
            <span className="mb-1.5 block text-xs font-medium text-gray-500">Search</span>
            <span className="relative block">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="search"
                value={filters.search}
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                placeholder="Name, code or email…"
                className="w-full rounded-lg bg-gray-100 py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
              />
            </span>
          </label>

          <label className="min-w-[150px]">
            <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-500">
              <Building2 size={11} /> Department
            </span>
            <select
              value={filters.department}
              onChange={(e) => setFilters((p) => ({ ...p, department: e.target.value }))}
              className="w-full rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
            >
              <option value="">All departments</option>
              {departmentOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>

          <label className="min-w-[150px]">
            <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-500">
              <IdCard size={11} /> Designation
            </span>
            <select
              value={filters.designation}
              onChange={(e) => setFilters((p) => ({ ...p, designation: e.target.value }))}
              className="w-full rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
            >
              <option value="">All designations</option>
              {designationOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>

          <label className="min-w-[150px]">
            <span className="mb-1.5 block text-xs font-medium text-gray-500">Status</span>
            <select
              value={filters.evaluationStatus}
              onChange={(e) => setFilters((p) => ({ ...p, evaluationStatus: e.target.value }))}
              className="w-full rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
            >
              <option value="">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
              <option value="Unassigned">Unassigned</option>
            </select>
          </label>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              <X size={14} />
              Clear ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">
          {orgWide ? "Employees" : "Team Members"}
        </h2>
        <span className="text-sm text-gray-500">
          {loading
            ? "…"
            : activeFilterCount > 0
              ? `${visible.length} of ${members.length} ${noun}${members.length === 1 ? "" : "s"}`
              : `${members.length} ${noun}${members.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* ---------------- Compare selection bar ---------------- */}
      {canCompare && compareIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/30 bg-brand-light/40 px-4 py-3">
          <GitCompare size={16} className="shrink-0 text-brand-dark" />
          <p className="min-w-0 flex-1 text-sm text-gray-700">
            <strong>
              {compareIds.length} of {COMPARE_MAX} selected
            </strong>
            {compareIds.length < COMPARE_MIN
              ? ` — pick at least ${COMPARE_MIN} to compare`
              : compareNames && <span className="text-gray-500"> · {compareNames}</span>}
          </p>
          <button
            type="button"
            onClick={() => setCompareIds([])}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <X size={14} />
            Clear
          </button>
          <button
            type="button"
            onClick={runCompare}
            disabled={compareIds.length < COMPARE_MIN || comparing}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand-dark px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {comparing ? <Loader2 size={14} className="animate-spin" /> : <GitCompare size={14} />}
            {comparing ? "Comparing…" : "Compare"}
          </button>
        </div>
      )}

      {!loading && members.length === 0 && !error ? (
        <EmptyState
          icon={Users}
          title={orgWide ? "No employees to evaluate" : "No team members assigned"}
          description={
            orgWide
              ? "There are no active employees on record yet."
              : "You don't have any team members assigned to you yet. Ask HR to update your team assignment."
          }
        />
      ) : !loading && visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matches"
          description={`No ${noun} matches the current filters.`}
          actionLabel="Clear filters"
          onAction={() => setFilters(EMPTY_FILTERS)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => {
            const picked = compareIds.includes(m.employeeId);
            return (
            <div
              key={m.employeeId}
              className={`rounded-2xl bg-white p-5 shadow-sm ring-1 transition ${
                picked ? "ring-2 ring-brand" : "ring-gray-100"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  {canCompare && (
                    /*
                     * Disabled at the cap rather than hidden, and only for cards
                     * that are not already ticked — hiding it would make the
                     * seventh card look like it cannot be compared at all, when
                     * the real constraint is that something must be unticked first.
                     */
                    <input
                      type="checkbox"
                      checked={picked}
                      disabled={!picked && compareIds.length >= COMPARE_MAX}
                      onChange={() => toggleCompare(m.employeeId)}
                      aria-label={`Select ${m.firstName} ${m.lastName} for comparison`}
                      title={
                        !picked && compareIds.length >= COMPARE_MAX
                          ? `Up to ${COMPARE_MAX} can be compared at once`
                          : "Select for comparison"
                      }
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-brand-dark focus:ring-brand disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  )}
                  <EmployeeAvatar
                    firstName={m.firstName}
                    lastName={m.lastName}
                    photo={m.avatarUrl}
                    thumb={m.avatarThumbUrl}
                    size={44}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {m.firstName} {m.lastName}
                    </p>
                    <p className="truncate text-xs text-gray-500">{m.designation}</p>
                  </div>
                </div>
                <StatusBadge status={m.status} />
              </div>

              <div className="mt-4 space-y-1.5 text-xs text-gray-500">
                <p className="flex items-center gap-1.5 truncate">
                  <Mail size={12} className="shrink-0" /> {m.email}
                </p>
                <p>#{m.employeeCode} · {m.department}</p>
                <p>Joined {formatDisplayDate(m.joiningDate)}</p>
              </div>

              <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                      {statusIcon(m.evaluationStatus)}
                      {m.evaluationStatus}
                    </p>
                    {m.assignedFormName && (
                      <p className="mt-0.5 truncate text-xs text-gray-500">{m.assignedFormName}</p>
                    )}
                    {m.lastReviewedAt && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        Last reviewed {formatDisplayDate(m.lastReviewedAt)}
                        {m.lastScore !== null && ` · ${m.lastScore}%`}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate(`/team/evaluate/${m.employeeId}`)}
                disabled={m.evaluationStatus === "Unassigned"}
                title={
                  m.evaluationStatus === "Unassigned"
                    ? "No evaluation form assigned to this employee"
                    : "Open evaluation form"
                }
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-none disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none"
              >
                <ClipboardCheck size={15} />
                {m.evaluationStatus === "Completed" ? "Review Again" : "Evaluate Performance"}
              </button>
            </div>
            );
          })}
        </div>
      )}

      {/*
        A drawer rather than a route: the selection lives on the roster, so
        closing the comparison has to put the lead back on the cards they ticked
        with the ticks intact. The Compare page keeps its own full-width screen —
        `dense` collapses the shared view to one column to fit here.
      */}
      <SidePanel
        open={compareOpen}
        title="Performance Comparison"
        description={compareNames || undefined}
        onClose={() => setCompareOpen(false)}
        maxWidth="max-w-3xl"
      >
        {comparing ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Loader2 size={30} className="animate-spin text-brand" />
            <p className="text-sm text-gray-500">Loading comparison data…</p>
          </div>
        ) : compareResult ? (
          <CompareResultView result={compareResult} dense />
        ) : (
          <div className="py-16 text-center">
            <AlertCircle size={22} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-500">No comparison data to show.</p>
          </div>
        )}
      </SidePanel>
    </DashboardLayout>
  );
}
