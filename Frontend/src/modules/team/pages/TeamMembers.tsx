import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Mail, ClipboardCheck, AlertCircle, CheckCircle2, XCircle, TrendingUp,
  Building2, IdCard, Search, X, ShieldCheck, Clock,
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import LoadingOverlay from "@/components/common/LoadingOverlay";
import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import AppraisalNotificationsPanel from "@/modules/appraisal/components/AppraisalNotificationsPanel";
import {
  teamAppraisalApi, appraisalDashboardApi,
  type TeamMember, type TeamStats, type TeamLeadDashboard,
} from "@/modules/appraisal/api/appraisalApi";
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

export default function TeamMembers() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [dashboard, setDashboard] = useState<TeamLeadDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const showError = useCallback((err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
  }, []);

  useEffect(() => {
    teamAppraisalApi
      .getMyTeam()
      .then(setMembers)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your team."))
      .finally(() => setLoading(false));

    // Stats are supplementary — a failure here shouldn't blank the roster.
    teamAppraisalApi.getTeamStats().then(setStats).catch(() => {});

    // Workflow counts (pending / submitted / approved) come from the dashboard
    // endpoint, which is roster-scoped server-side. Also supplementary.
    appraisalDashboardApi.teamLead().then(setDashboard).catch(() => {});
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

  // The roster carries `evaluationStatus`, which is where a pending count that
  // matches the cards on screen has to come from; the dashboard's `pending`
  // counts reviews and can legitimately differ, so both are shown separately
  // rather than one being presented as the other.
  const pendingOnRoster = members.filter((m) => m.evaluationStatus === "Pending");
  const firstPending = pendingOnRoster[0];

  return (
    <DashboardLayout title="My Team" activeKey="employees">
      <LoadingOverlay show={loading} label="Loading your team…" />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
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

      {/* ---------------- Workflow counts ---------------- */}
      {dashboard && (
        <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {([
            ["Pending", dashboard.pending, "text-amber-600"],
            ["Submitted", dashboard.submitted, "text-gray-900"],
            ["Approved", dashboard.approved, "text-emerald-600"],
            ["Team Size", dashboard.teamSize, "text-gray-900"],
          ] as const).map(([label, value, tone]) => (
            <div key={label} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <p className="flex items-center gap-1.5 text-xs text-gray-500">
                <ShieldCheck size={12} className="text-gray-400" />
                {label}
              </p>
              <p className={`mt-0.5 text-xl font-semibold ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {stats && (
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <TrendingUp size={15} className="text-brand-dark" /> Team Statistics
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500">Team Size</p>
              <p className="mt-0.5 text-xl font-semibold text-gray-900">{stats.teamSize}</p>
            </div>
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

          {stats.averageScore !== null && (
            <p className="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-600">
              Team average score: <strong className="text-gray-900">{stats.averageScore}%</strong>
            </p>
          )}

          {stats.distribution.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
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

      <div className="mb-5">
        <AppraisalNotificationsPanel onError={showError} compact />
      </div>

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
        <h2 className="text-base font-semibold text-gray-900">Team Members</h2>
        <span className="text-sm text-gray-500">
          {loading
            ? "…"
            : activeFilterCount > 0
              ? `${visible.length} of ${members.length} member${members.length === 1 ? "" : "s"}`
              : `${members.length} member${members.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {!loading && members.length === 0 && !error ? (
        <EmptyState
          icon={Users}
          title="No team members assigned"
          description="You don't have any team members assigned to you yet. HR controls this from Team Lead Assignments."
        />
      ) : !loading && visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matches"
          description="No team member matches the current filters."
          actionLabel="Clear filters"
          onAction={() => setFilters(EMPTY_FILTERS)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => (
            <div key={m.employeeId} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
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
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ClipboardCheck size={15} />
                {m.evaluationStatus === "Completed" ? "Review Again" : "Evaluate Performance"}
              </button>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
