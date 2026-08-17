import { useDevAuth } from "@/app/providers/DevAuthContext";
import { useAuth } from "@/app/providers/AuthContext";
import { ROLES } from "@/constants/roles";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import PeriodStatCards from "@/modules/dashboard/components/PeriodStatCards";
import DashboardCalendar from "@/modules/dashboard/components/DashboardCalendar";
import UpcomingEvents from "@/modules/dashboard/components/UpcomingEvents";
import TeamAnalyticsCard from "@/modules/dashboard/components/TeamAnalyticsCard";
import TodayAttendanceTable from "@/modules/dashboard/components/TodayAttendanceTable";
import SelfAttendanceTable from "@/modules/dashboard/components/SelfAttendanceTable";

// ============================================================================
// Dashboard composed by ROLE, on top of the live backend permission set.
//
// Which widgets appear is decided by the signed-in user's normalized role
// (AuthContext's `user.role`), per the product spec:
//   - HR Manager / Administrator: the org-wide counters (headcount, today's
//     present/absent/on-leave, pending leave requests, pending appraisals) and
//     the Today's Attendance table.
//   - Team Lead: the team appraisal mean and appraisal workload, their OWN
//     month-to-date figures, Team Analytics listing their real roster, and
//     their own last 7 working days.
//   - Employee: their OWN figures and their last 7 working days.
// An unrecognised role falls through to the employee view, so it can never
// render an org-wide widget by accident.
//
// Every number comes from the backend dashboard aggregates — one request per
// dashboard (GET /dashboard/admin | /team | /me) rather than several list calls
// counted up in the browser. That is not just a round-trip saving: figures like
// "Working Days (Till Today)" need the working-week ladder and the holiday
// calendar, whose endpoints are gated on `working-days.view`, so an Employee
// could never have computed them client-side. Role decides *composition*,
// permissions still decide *access* — each widget renders its own 403 state.
// ============================================================================

export default function RbacDashboard() {
  const { session } = useDevAuth();
  const { user } = useAuth();

  if (!session) return null;

  // `session` is derived from the same `user`, so when it exists the role is
  // resolved — no loading race between the two.
  const role = user?.role;
  const isHrAdmin = role === ROLES.HR_MANAGER || role === ROLES.ADMINISTRATOR;
  const isTeamLead = role === ROLES.TEAM_LEAD;

  return (
    <DashboardLayout title={`Dashboard — ${session.role.role_name}`} activeKey="dashboard">
      <div className="mx-auto w-full max-w-[1600px] space-y-6">
        {/* ==================== MAIN GRID ==================== */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            {/* One card set per role: org-wide counters for HR/Admin, team +
                own figures for a Team Lead, own figures for everyone else. */}
            <PeriodStatCards variant={isHrAdmin ? "admin" : isTeamLead ? "team" : "self"} />

            {/* Team Analytics is the Team Lead's window into their real roster
                (GET /dashboard/team) — not shown to HR/Admin or plain employees. */}
            {isTeamLead && <TeamAnalyticsCard />}

            {/* The attendance table is org-wide for HR/Admin and self-scoped for
                a Team Lead and Employee. The self-scoped table reads the
                permission-free `/dashboard/me` route, so it works even though
                Team Lead and Employee lack `attendance.view`. */}
            {isHrAdmin ? (
              <TodayAttendanceTable />
            ) : (
              <SelfAttendanceTable />
            )}
          </div>

          <div className="xl:col-span-1">
            <div className="space-y-6 xl:sticky xl:top-6">
              <DashboardCalendar />
              {/* Same list for Employee, Team Lead, HR, and Admin — everyone
                  reads the org's Holidays & Events calendar (Leave →
                  Holidays & Events), so nothing here is role-gated. */}
              <UpcomingEvents />
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
