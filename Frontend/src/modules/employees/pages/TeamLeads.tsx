import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UserCog,
  ChevronDown,
  ChevronUp,
  Eye,
  Pencil,
  Mail,
  Phone as PhoneIcon,
  Search,
  RefreshCw,
} from "lucide-react";

import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import SectionTabs from "@/components/common/SectionTabs";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import { getEmployeeTabs } from "@/config/featureTabs";
import { useAuth } from "@/app/providers/AuthContext";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { ApiError } from "@/lib/apiClient";

import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import TeamMemberList from "@/modules/employees/components/TeamMemberList";
import { employeeService } from "@/modules/employees/api/employeeService";
import { fullName, type Employee } from "@/modules/employees/types/employee.types";
import type { Department } from "@/modules/settings/api/settingsApi";
import { departmentsApi } from "@/modules/settings/api/settingsApi";

type TeamLead = Employee & { team_member_count: number };

const PAGE_SIZE = 12;

/**
 * Admin-only Team Leads tab.
 *
 * Shows Team Leads grouped by department, with expandable rosters served by
 * the backend's GET /users/:id/team. Search at the page level filters both
 * leads and their members server-side, so typing a member name surfaces their
 * lead's card with the matching member highlighted inside.
 */
export default function TeamLeadsPage() {
  const status = useBackendStatus();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const tabs = useMemo(
    () =>
      getEmployeeTabs({
        showTeamLeads: hasPermission("employees.team.view"),
        showCards: hasPermission("employees.card.view"),
      }),
    [hasPermission],
  );

  const [departments, setDepartments] = useState<Department[]>([]);
  const [leads, setLeads] = useState<TeamLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [leadFilter, setLeadFilter] = useState("");
  const [leadOptions, setLeadOptions] = useState<Employee[]>([]);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    void departmentsApi
      .list()
      .then((res) => setDepartments(res.data))
      .catch(() => {
        // A failed department fetch costs the filter dropdown, not the page.
        // The lead list below renders unfiltered, which is still useful.
        setDepartments([]);
      });
  }, []);

  // The Team Lead dropdown follows the department filter: picking a department
  // then opening this list should not offer leads from elsewhere.
  useEffect(() => {
    void employeeService
      .teamLeads(departmentFilter || undefined)
      .then(setLeadOptions)
      .catch(() => setLeadOptions([]));
  }, [departmentFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await employeeService.list({
        team_leads_only: true,
        include_team_count: true,
        search: search || undefined,
        department_id: departmentFilter || undefined,
        // Server-side rather than filtering `leads` in memory: with 12 rows a
        // page, an in-memory filter would silently hide leads that live on
        // another page and leave the pager showing counts that don't match.
        user_id: leadFilter || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setLeads(result.data as TeamLead[]);
      setTotal(result.total);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't load Team Leads.",
      );
      setLeads([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, departmentFilter, leadFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Reloads the lead cards and every expanded roster together.
   *
   * The counts on a card and the rows inside it come from two different
   * endpoints, so refreshing only one leaves the card claiming 5 members over
   * a list showing 4. Bumping the token drives both.
   */
  const refreshAll = useCallback(() => {
    setRefreshToken((t) => t + 1);
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, departmentFilter, leadFilter]);

  // A lead selected under one department isn't valid once the department
  // changes, so clear it rather than issue a query that can't match.
  useEffect(() => {
    setLeadFilter("");
  }, [departmentFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const groupedLeads = useMemo(() => {
    const map = new Map<string, TeamLead[]>();
    for (const lead of leads) {
      const deptName = lead.department?.department_name ?? "No Department";
      if (!map.has(deptName)) map.set(deptName, []);
      map.get(deptName)!.push(lead);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [leads]);

  return (
    <DashboardLayout title="Team Leads" activeKey="employees">
      <BackendStatusBanner status={status} />
      <SectionTabs tabs={tabs} active="team-leads" />

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Team Leads or members..."
            className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-sm ring-1 ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
          />
        </div>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="rounded-xl border-0 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm ring-1 ring-gray-200 focus:ring-2 focus:ring-brand/60"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.departmentId} value={d.departmentId}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={leadFilter}
          onChange={(e) => setLeadFilter(e.target.value)}
          className="rounded-xl border-0 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm ring-1 ring-gray-200 focus:ring-2 focus:ring-brand/60"
        >
          <option value="">All Team Leads</option>
          {leadOptions.map((lead) => (
            <option key={lead.user_id} value={lead.user_id}>
              {fullName(lead)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={refreshAll}
          disabled={loading}
          aria-label="Refresh Team Leads"
          className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-gray-100"
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          {error}{" "}
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Try again
          </button>
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No Team Leads found"
          description={
            search || departmentFilter
              ? "Try adjusting your search or filters."
              : "No Team Leads have been assigned yet."
          }
        />
      ) : (
        <>
          {groupedLeads.map(([deptName, deptLeads]) => (
            <div key={deptName} className="mb-6">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">{deptName}</h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {deptLeads.map((lead) => {
                  const isExpanded = expandedLeadId === lead.user_id;
                  return (
                    <div
                      key={lead.user_id}
                      className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 transition hover:shadow-md"
                    >
                      <div className="p-5">
                        <div className="mb-4 flex items-start gap-3">
                          <EmployeeAvatar
                            firstName={lead.first_name}
                            lastName={lead.last_name}
                            photo={lead.profile_image}
                            thumb={lead.profile_image_thumb}
                            size={56}
                          />
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold text-gray-900">
                              {fullName(lead)}
                            </h3>
                            <p className="truncate text-xs text-gray-500">
                              {lead.designation?.title ?? "Team Lead"}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">{lead.employee_code}</p>
                          </div>
                          <StatusBadge status={lead.status ? "active" : "inactive"} />
                        </div>

                        <div className="mb-4 space-y-1.5 text-xs text-gray-600">
                          {lead.email && (
                            <div className="flex items-center gap-2">
                              <Mail size={13} className="shrink-0 text-gray-400" />
                              <span className="truncate">{lead.email}</span>
                            </div>
                          )}
                          {lead.phone && (
                            <div className="flex items-center gap-2">
                              <PhoneIcon size={13} className="shrink-0 text-gray-400" />
                              <span>{lead.phone}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <UserCog size={13} className="shrink-0 text-gray-400" />
                            <span>
                              {lead.team_member_count} team member
                              {lead.team_member_count === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/employees/${lead.user_id}`)}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand-light"
                          >
                            <Eye size={13} />
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/employees/${lead.user_id}/edit`)}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100"
                          >
                            <Pencil size={13} />
                            Edit
                          </button>
                          {lead.team_member_count > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLeadId(isExpanded ? null : lead.user_id)
                              }
                              className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp size={13} />
                                  Collapse
                                </>
                              ) : (
                                <>
                                  <ChevronDown size={13} />
                                  Expand Team
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <TeamMemberList
                          teamLeadId={lead.user_id}
                          search={search}
                          onOpenEmployee={(e) => navigate(`/employees/${e.user_id}`)}
                          refreshToken={refreshToken}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between rounded-2xl bg-white px-5 py-3 shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages} · {total} Team Lead{total === 1 ? "" : "s"}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg bg-brand-light px-4 py-2 text-sm font-semibold text-brand-dark transition hover:brightness-95 disabled:opacity-40 disabled:hover:brightness-100"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
