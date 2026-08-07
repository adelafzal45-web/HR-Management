import { useEffect, useState } from "react";
import { useDevAuth } from "@/app/providers/DevAuthContext";
import { useAuth } from "@/app/providers/AuthContext";
import { api, ApiError, ENDPOINTS } from "@/lib/apiClient";
import { ROLES } from "@/constants/roles";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import PeriodStatCards from "@/modules/dashboard/components/PeriodStatCards";
import DashboardCalendar from "@/modules/dashboard/components/DashboardCalendar";
import TeamAnalyticsCard from "@/modules/dashboard/components/TeamAnalyticsCard";
import TodayAttendanceTable from "@/modules/dashboard/components/TodayAttendanceTable";
import SelfAttendanceTable from "@/modules/dashboard/components/SelfAttendanceTable";

// ============================================================================
// Dashboard composed by ROLE, on top of the live backend permission set.
//
// Which widgets appear is decided by the signed-in user's normalized role
// (AuthContext's `user.role`), per the product spec:
//   - HR Manager / Administrator: org-wide stats — PeriodStatCards and the
//     Today's Attendance table, both unscoped.
//   - Team Lead: their OWN stats (PeriodStatCards + Today's Attendance scoped
//     to their user id) plus Team Analytics listing their direct reports.
//   - Employee: their OWN PeriodStatCards only.
// An unrecognised role falls through to the employee view, so it can never
// render an org-wide widget by accident.
//
// Every number still comes from a real endpoint response, and each widget
// keeps its own permission gate — role decides *composition*, permissions
// decide *access*. There is no dashboard/stats aggregate endpoint, so the
// widgets compute their own numbers client-side from the real list endpoints
// (GET /attendance, GET /leave-requests, GET /users, GET /users/me/team).
// ============================================================================

export default function RbacDashboard() {
  const { session } = useDevAuth();
  const { user } = useAuth();

  const [, setSelfProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    api.get(ENDPOINTS.users.byId(session.userId)).catch((err) => {
      if (!cancelled) {
        setSelfProfileError(
          err instanceof ApiError ? `${err.status === 403 ? "Access denied" : err.status}: ${err.message}` : "Failed to load profile",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session) return null;

  // `session` is derived from the same `user`, so when it exists the role is
  // resolved — no loading race between the two.
  const role = user?.role;
  const isHrAdmin = role === ROLES.HR_MANAGER || role === ROLES.ADMINISTRATOR;
  const isTeamLead = role === ROLES.TEAM_LEAD;
  const ownId = session.userId;

  return (
    <DashboardLayout title={`Dashboard — ${session.role.role_name}`} activeKey="dashboard">
      <div className="mx-auto w-full max-w-[1600px] space-y-6">
        {/* ==================== MAIN GRID ==================== */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            {/* HR/Admin see org-wide stats; everyone else sees only their own. */}
            <PeriodStatCards employeeId={isHrAdmin ? undefined : ownId} />

            {/* Team Analytics is the Team Lead's window into their own reports
                (GET /users/me/team) — not shown to HR/Admin or plain employees. */}
            {isTeamLead && <TeamAnalyticsCard />}

            {/* The attendance table is org-wide for HR/Admin and self-scoped for
                a Team Lead and Employee. The self-scoped table reads the permission
                -free `/attendance/me` route, so it works even though Team Lead and
                Employee lack `attendance.view`. */}
            {isHrAdmin ? (
              <TodayAttendanceTable />
            ) : (
              <SelfAttendanceTable />
            )}
          </div>

          <div className="xl:col-span-1">
            <div className="xl:sticky xl:top-6">
              <DashboardCalendar />
            </div>
          </div>
        </div>

        {/* If nothing is visible at all, this role truly has zero grants yet */}
        {session.permissions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            The role <strong>{session.role.role_name}</strong> currently has 0 permissions assigned in the backend
            (checked live via <code>GET /api/role-permissions</code>). Assign permissions to this role via{" "}
            <code>POST /api/role-permissions</code> to unlock dashboard sections and menu items — nothing is
            invented client-side.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
