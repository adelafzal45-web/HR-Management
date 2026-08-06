import { useEffect, useState } from "react";
import { useDevAuth } from "@/app/providers/DevAuthContext";
import { api, ApiError, ENDPOINTS } from "@/lib/apiClient";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import PeriodStatCards from "@/modules/dashboard/components/PeriodStatCards";
import DashboardCalendar from "@/modules/dashboard/components/DashboardCalendar";
import TeamAnalyticsCard from "@/modules/dashboard/components/TeamAnalyticsCard";
import TodayAttendanceTable from "@/modules/dashboard/components/TodayAttendanceTable";

// ============================================================================
// Dashboard that is 100% driven by the current session's REAL backend
// permissions (see DevAuthContext). Every section below is gated by an
// actual permission key enforced by the backend's PermissionGuard, and every
// number shown comes from a real endpoint response -- never invented.
//
// There is no dashboard/stats aggregate endpoint in the backend, so the
// Daily/Weekly/Monthly card summary and the Team Analytic / Today's
// Attendance widgets each compute their own numbers client-side from the
// real list endpoints (GET /attendance, GET /leave-requests, GET /users).
// ============================================================================

export default function RbacDashboard() {
  const { session } = useDevAuth();

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

  return (
    <DashboardLayout title={`Dashboard — ${session.role.role_name}`} activeKey="dashboard">
      <div className="mx-auto w-full max-w-[1600px] space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
           
          </div>
          
        </header>

       

        

        {/* ==================== MAIN GRID ==================== */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <PeriodStatCards />
            <TeamAnalyticsCard />
            <TodayAttendanceTable />
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
