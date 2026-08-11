import { useEffect, useMemo, useState } from "react";
import { Search, Users, Briefcase, CalendarOff } from "lucide-react";
import { ApiError } from "@/lib/apiClient";
import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import {
  dashboardApi,
  type TeamDashboard,
  type TeamMemberStat,
} from "@/modules/dashboard/api/dashboardApi";

// ============================================================================
// The Team Lead's roster, straight from GET /dashboard/team.
//
// This used to read GET /users/me/team and cross-reference GET /attendance
// (org-wide, `attendance.view`) to guess who was in today — which meant a lead
// without that permission saw an empty "Working" tab. The aggregate endpoint
// resolves the roster from both places the system records it (the
// `users.team_lead_id` reporting line and explicit appraisal assignments),
// counts each member's month-to-date attendance against their own working
// calendar, and averages their appraisal scores. A lead with no roster gets an
// empty team — never a fallback to the whole organisation.
//
// Columns are the five the product asks for: Emp Code, Emp Name, Designation,
// Present, Performance.
// ============================================================================

/** How many rows to render before collapsing into a "+N more" footer. */
const VISIBLE_ROWS = 10;

type Tab = "all" | "working" | "out-of-office";

/** The API returns one display name; the avatar wants initials from two parts. */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.length > 1 ? parts[parts.length - 1] : "" };
}

/** Attendance statuses that mean the member was at work today. */
const PRESENT_TODAY = new Set(["Present", "Late", "Half-Day"]);

const percent = (n: number | null) =>
  typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";

export default function TeamAnalyticsCard() {
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamDashboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    dashboardApi
      .getTeam()
      .then((data) => {
        if (!cancelled) setTeam(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 403
            ? "Your role can't view team appraisal data."
            : "Couldn't load team analytics.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered: TeamMemberStat[] = useMemo(() => {
    let list = team?.members ?? [];

    if (tab === "working") {
      list = list.filter((m) => m.today_status !== null && PRESENT_TODAY.has(m.today_status));
    } else if (tab === "out-of-office") {
      list = list.filter(
        (m) => m.on_leave_today || m.today_status === "Absent" || m.today_status === "On Leave",
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.employee_name.toLowerCase().includes(q) ||
          m.employee_code.toLowerCase().includes(q) ||
          (m.designation ?? "").toLowerCase().includes(q),
      );
    }

    return list;
  }, [team, tab, search]);

  const rows = filtered.slice(0, VISIBLE_ROWS);
  const hidden = filtered.length - rows.length;

  const emptyMessage =
    tab === "working"
      ? "No team members are working today."
      : tab === "out-of-office"
        ? "Nobody is out of office today."
        : team && team.team_size === 0
          ? "No team members are assigned to you yet."
          : "No team members match that search.";

  const TABS: { key: Tab; label: string; icon?: typeof Briefcase }[] = [
    { key: "all", label: "All" },
    { key: "working", label: "Working Today", icon: Briefcase },
    { key: "out-of-office", label: "Out of Office", icon: CalendarOff },
  ];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900 sm:text-lg">Team Analytics</h3>
          {team && (
            <p className="mt-0.5 text-xs text-gray-400">
              {team.team_size} {team.team_size === 1 ? "member" : "members"} · {team.month} ·
              team mean {percent(team.team_performance_mean)}
            </p>
          )}
        </div>
        <div className="relative w-full max-w-[220px] sm:w-auto">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="min-h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
          />
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-full bg-gray-100 p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
              tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
            aria-pressed={tab === key}
          >
            {Icon && <Icon size={14} />}
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <th className="py-2 pr-3 font-semibold">Emp Code</th>
              <th className="py-2 pr-3 font-semibold">Emp Name</th>
              <th className="py-2 pr-3 font-semibold">Designation</th>
              <th className="py-2 pr-3 text-right font-semibold">Present</th>
              <th className="py-2 pr-3 text-right font-semibold">Performance</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="py-3" colSpan={5}>
                    <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
                  </td>
                </tr>
              ))}

            {!loading && error && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-xs text-rose-500">
                  {error}
                </td>
              </tr>
            )}

            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8">
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <Users size={22} />
                    <p className="text-xs">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              rows.map((m, i) => {
                const { firstName, lastName } = splitName(m.employee_name);
                return (
                  <tr
                    key={m.user_id}
                    className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? "bg-amber-50/40" : ""}`}
                  >
                    <td className="py-2.5 pr-3 font-medium text-gray-500">{m.employee_code}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <EmployeeAvatar
                          firstName={firstName}
                          lastName={lastName}
                          photo={m.avatar_url}
                          thumb={m.avatar_thumb_url}
                          size={32}
                        />
                        <span className="font-medium text-gray-900">{m.employee_name}</span>
                        {m.on_leave_today && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            On leave
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-700">{m.designation ?? "—"}</td>
                    {/* Present days always carry their denominator, so the figure
                        can be read against the member's own working calendar. */}
                    <td className="py-2.5 pr-3 text-right text-gray-700">
                      {m.present_days}
                      <span className="text-gray-400">/{m.working_days}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      {m.performance === null ? (
                        <span className="text-xs font-medium text-amber-600">Pending</span>
                      ) : (
                        <span className="font-semibold text-gray-900">{percent(m.performance)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {hidden > 0 && (
        <p className="mt-3 text-center text-xs text-gray-400">
          Showing {rows.length} of {filtered.length} — {hidden} more
        </p>
      )}
    </div>
  );
}
